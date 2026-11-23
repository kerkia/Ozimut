package com.ozimut.web

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.util.concurrent.Executors

/**
 * The Ozimut companion app (docs/app/design.md): the live site in a web view, and the bridge to what a page cannot do —
 * native notifications, files opened with or shared to the app, the document scanner, handing a file over to be saved.
 * No tracking, no account of its own, nothing about buying: a checkout host is never loaded nor handed to the browser.
 */
class MainActivity : ComponentActivity() {
    companion object {
        /** A site address (« /#/… ») to open: a tapped notification's (ours, or the system's from the message's data). */
        const val EXTRA_URL = "url"
        private const val PREFS = "ozimut"
        private const val K_PUSH_ASKED = "pushAsked"
        private const val K_PUSH_ON = "pushOn"
    }

    private val base: String = BuildConfig.BASE_URL.trimEnd('/')

    private lateinit var web: WebView
    private lateinit var errorView: View
    private lateinit var bridge: Bridge
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()

    /** The page said it listens (its first `info` call); reset at each load of a page. */
    private var pageReady = false
    private val pending = ArrayDeque<String>()
    private var delivering = false

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null
    private var geoPending: Pair<String, GeolocationPermissions.Callback>? = null
    private var pushPending: ((Any) -> Unit)? = null
    private var scanPending: ((Any?) -> Unit)? = null

    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val cb = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        var uris: Array<Uri>? = null
        if (r.resultCode == RESULT_OK) {
            val data = r.data
            val clip = data?.clipData
            uris = when {
                clip != null && clip.itemCount > 0 -> Array(clip.itemCount) { clip.getItemAt(it).uri }
                data?.data != null -> arrayOf(data.data!!)
                cameraUri != null -> arrayOf(cameraUri!!)
                else -> null
            }
        }
        cameraUri = null
        cb.onReceiveValue(uris)
    }

    private val geoPerms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        val p = geoPending ?: return@registerForActivityResult
        geoPending = null
        p.second.invoke(p.first, r.values.any { it }, false)
    }

    private val notifPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val cb = pushPending ?: return@registerForActivityResult
        pushPending = null
        if (granted) fetchPushToken(cb) else cb(pushFailed("denied"))
    }

    private val scanner = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        val cb = scanPending ?: return@registerForActivityResult
        scanPending = null
        val page = if (r.resultCode == RESULT_OK) {
            try {
                GmsDocumentScanningResult.fromActivityResultIntent(r.data)?.pages?.firstOrNull()?.imageUri
            } catch (e: Exception) {
                null
            }
        } else {
            null
        }
        if (page == null) { cb(JSONObject.NULL); return@registerForActivityResult }
        io.execute {
            val out: Any = try {
                val bytes = contentResolver.openInputStream(page)?.use { it.readBytes() }
                if (bytes == null || bytes.isEmpty()) JSONObject.NULL
                else JSONObject()
                    .put("name", "carte-" + System.currentTimeMillis() + ".jpg")
                    .put("mime", "image/jpeg")
                    .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
            } catch (e: Exception) {
                JSONObject.NULL
            } catch (e: OutOfMemoryError) {
                JSONObject.NULL
            }
            runOnUiThread { cb(out) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        web = WebView(this)
        errorView = offlineScreen()
        errorView.visibility = View.GONE
        val frame = FrameLayout(this)
        frame.setBackgroundColor(0xFFFFFFFF.toInt())
        frame.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        frame.addView(errorView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        // under the system bars and above the keyboard (edge to edge since Android 15)
        ViewCompat.setOnApplyWindowInsetsListener(frame) { view, insets ->
            val b = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime() or WindowInsetsCompat.Type.displayCutout()
            )
            view.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(frame)

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = false
        s.allowContentAccess = true
        s.mediaPlaybackRequiresUserGesture = true
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        s.setGeolocationEnabled(true)
        s.setSupportMultipleWindows(true)          // window.open and target=_blank come to onCreateWindow, which routes them
        s.userAgentString = s.userAgentString + " OzimutApp/" + BuildConfig.VERSION_NAME + " (android)"
        CookieManager.getInstance().setAcceptCookie(true)

        bridge = Bridge(this)
        web.addJavascriptInterface(bridge, "OzimutNative")
        web.webViewClient = Client()
        web.webChromeClient = Chrome()
        web.setDownloadListener { url, ua, cd, mime, _ -> download(url, ua, cd, mime) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (errorView.visibility != View.VISIBLE && web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState != null && web.restoreState(savedInstanceState) != null) {
            // the system brought the app back: the page as it was; the intent that started it was handled then
        } else {
            handleIntent(intent, initial = true)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent, initial = false)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::web.isInitialized) web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) web.onResume()
    }

    override fun onPause() {
        super.onPause()
        if (::web.isInitialized) web.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        if (::web.isInitialized) {
            web.removeJavascriptInterface("OzimutNative")
            web.destroy()
        }
        super.onDestroy()
    }

    // ---- Intents: a tapped notification, files opened with or shared to the app

    private fun handleIntent(i: Intent?, initial: Boolean) {
        var loaded = false
        if (i != null && (i.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0) {
            i.getStringExtra(EXTRA_URL)?.let { url ->
                i.removeExtra(EXTRA_URL)
                val target = siteAddress(url)
                if (target != null) {
                    if (initial) {
                        loadSite(target)
                        loaded = true
                    } else {
                        queue(JSONObject().put("type", "push").put("url", url))
                    }
                }
            }
            when (i.action) {
                Intent.ACTION_VIEW -> {
                    val d = i.data
                    if (d != null && (d.scheme == "content" || d.scheme == "file")) readFiles(listOf(d), i.type)
                }
                Intent.ACTION_SEND -> {
                    @Suppress("DEPRECATION")
                    val u = i.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                    if (u != null) readFiles(listOf(u), i.type)
                }
                Intent.ACTION_SEND_MULTIPLE -> {
                    @Suppress("DEPRECATION")
                    val list = i.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
                    if (!list.isNullOrEmpty()) readFiles(list.take(12), i.type)
                }
            }
        }
        if (initial && !loaded) loadSite("$base/")
    }

    /** A notification's address as one of the site's own (« /#/… » or a whole address on the site's origin), else null. */
    private fun siteAddress(url: String): String? {
        val u = url.trim()
        if (u.isEmpty()) return null
        val target = when {
            u.startsWith("/") -> base + u
            u.startsWith("#") -> "$base/$u"
            else -> u
        }
        return if (Policy.decide(target, base, true) == Policy.Verdict.ALLOW && Policy.sameOrigin(target, base)) target else null
    }

    private fun loadSite(url: String) {
        errorView.visibility = View.GONE
        web.loadUrl(url)
    }

    /** The files that came together go to the page together (blocking reads on the io thread). */
    private fun readFiles(uris: List<Uri>, type: String?) {
        io.execute {
            val files = JSONArray()
            for (u in uris) Files.entryOf(applicationContext, u, type)?.let { files.put(it) }
            if (files.length() > 0) runOnUiThread { queue(JSONObject().put("type", "files").put("files", files)) }
        }
    }

    // ---- Events to the page

    fun js(code: String) {
        if (::web.isInitialized) web.evaluateJavascript(code, null)
    }

    /** Shell → site events, held until the page says it listens (its first `info` call). */
    private fun queue(e: JSONObject) {
        pending.addLast(e.toString())
        deliver()
    }

    fun pageIsReady() {
        pageReady = true
        main.post { deliver() }
    }

    private fun deliver(tries: Int = 0) {
        if (delivering || pending.isEmpty() || !pageReady || !::web.isInitialized) return
        delivering = true
        val ev = pending.first()
        web.evaluateJavascript(
            "(function(e){if(window.__ozApp&&window.__ozApp.event){window.__ozApp.event(e);return 1}return 0})($ev)"
        ) { r ->
            delivering = false
            if (r == "1") {
                pending.removeFirstOrNull()
                deliver()
            } else if (tries < 20) {
                main.postDelayed({ deliver(tries + 1) }, 500)
            } else {
                pending.removeFirstOrNull()       // the page has no bridge: drop it
                deliver()
            }
        }
    }

    /** Is the page shown one of the site's own? (The bridge answers no other.) */
    fun onOurPage(): Boolean {
        val u = web.url ?: return false
        return Policy.sameOrigin(u, base)
    }

    // ---- Notifications (the page registers the token itself, with its session)

    private fun prefs() = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun pushFailed(state: String): JSONObject = JSONObject().put("ok", false).put("state", state)

    private fun notifGranted(): Boolean =
        Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** "on" | "off" | "denied" | "unavailable" */
    fun pushState(): String {
        if (!PushSupport.AVAILABLE) return "unavailable"
        val allowed = notifGranted() && Notifs.enabled(this)
        if (allowed) return if (prefs().getBoolean(K_PUSH_ON, false)) "on" else "off"
        // refused: asked before, or turned off in the system's settings (before Android 13 nothing is asked)
        return if (prefs().getBoolean(K_PUSH_ASKED, false) || Build.VERSION.SDK_INT < 33 || notifGranted()) "denied" else "off"
    }

    fun pushRegister(cb: (Any) -> Unit) {
        if (!PushSupport.AVAILABLE) { cb(pushFailed("unavailable")); return }
        if (!notifGranted()) {
            if (pushPending != null) { cb(pushFailed("off")); return }
            prefs().edit().putBoolean(K_PUSH_ASKED, true).apply()
            pushPending = cb
            notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        if (!Notifs.enabled(this)) { cb(pushFailed("denied")); return }
        fetchPushToken(cb)
    }

    private fun fetchPushToken(cb: (Any) -> Unit) {
        PushSupport.token(applicationContext) { token ->
            runOnUiThread {
                if (token.isNullOrBlank()) {
                    cb(pushFailed("off"))
                } else {
                    prefs().edit().putBoolean(K_PUSH_ON, true).apply()
                    cb(JSONObject().put("ok", true).put("kind", "fcm").put("token", token).put("env", "prod"))
                }
            }
        }
    }

    fun pushOff() {
        prefs().edit().putBoolean(K_PUSH_ON, false).apply()
        PushSupport.forget(applicationContext)
    }

    fun openAppSettings(): Boolean = try {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
    } catch (e: Exception) {
        false
    }

    // ---- A file the site made: the share sheet

    fun saveFile(name: String, mime: String, data: String, cb: (Boolean) -> Unit) {
        if (data.isEmpty()) { cb(false); return }
        io.execute {
            val chooserIntent = Files.shareIntent(applicationContext, name, mime, data)
            runOnUiThread {
                var ok = false
                if (chooserIntent != null) {
                    try {
                        startActivity(chooserIntent)
                        ok = true
                    } catch (e: Exception) {
                        // no app takes it
                    }
                }
                cb(ok)
            }
        }
    }

    // ---- The document scanner (Google Play services)

    fun scanAvailable(): Boolean = try {
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(this) == ConnectionResult.SUCCESS
    } catch (e: Exception) {
        false
    }

    /** One page scanned (edges found, perspective straightened) as `{ name, mime, data }`; null when given up. */
    fun scanMap(cb: (Any?) -> Unit) {
        if (!scanAvailable()) { cb(JSONObject.NULL); return }
        scanPending?.invoke(JSONObject.NULL)
        scanPending = cb
        try {
            val options = GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(true)
                .setPageLimit(1)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                .build()
            GmsDocumentScanning.getClient(options).getStartScanIntent(this)
                .addOnSuccessListener { sender ->
                    try {
                        scanner.launch(IntentSenderRequest.Builder(sender).build())
                    } catch (e: Exception) {
                        scanGivenUp()
                    }
                }
                .addOnFailureListener { scanGivenUp() }
        } catch (e: Exception) {
            scanGivenUp()
        }
    }

    private fun scanGivenUp() {
        val cb = scanPending ?: return
        scanPending = null
        cb(JSONObject.NULL)
    }

    // ---- Links

    private fun openOutside(u: Uri) {
        // (asked again here: nothing of a checkout is ever handed to the browser)
        if (Policy.decide(u.toString(), base, true) != Policy.Verdict.EXTERNAL) return
        try {
            val i = Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (u.scheme == "http" || u.scheme == "https") i.addCategory(Intent.CATEGORY_BROWSABLE)
            startActivity(i)
        } catch (e: Exception) {
            // nothing on the phone opens it
        }
    }

    /** A navigation of the page: shown here, handed to the browser, or dropped. -> true when the web view must not load it */
    private fun route(u: Uri, mainFrame: Boolean): Boolean = when (Policy.decide(u.toString(), base, mainFrame)) {
        Policy.Verdict.ALLOW -> false
        Policy.Verdict.EXTERNAL -> { openOutside(u); true }
        Policy.Verdict.BLOCK -> true
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            route(request.url, request.isForMainFrame)

        /** Nothing of a checkout host is fetched, whatever asks for it (a frame, a script, a redirect). */
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            val p = Policy.parts(request.url.toString()) ?: return null
            if ((p.scheme == "http" || p.scheme == "https") && Policy.isCheckout(p.host)) {
                return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
            }
            return null
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            pageReady = false
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            // no network (or the site out of reach): a screen of the app's own, with « Réessayer »
            errorView.visibility = View.VISIBLE
        }
    }

    private fun offlineScreen(): View {
        val d = resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xFFFFFFFF.toInt())
            setPadding(dp(32), dp(32), dp(32), dp(32))
            isClickable = true                       // nothing under it answers a tap
        }
        col.addView(TextView(this).apply {
            text = getString(R.string.net_offline_title)
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(0xFF1F2933.toInt())
            gravity = Gravity.CENTER
        })
        col.addView(TextView(this).apply {
            text = getString(R.string.net_offline_text)
            textSize = 16f
            setTextColor(0xFF6B7280.toInt())
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(22))
        })
        col.addView(Button(this).apply {
            text = getString(R.string.net_retry)
            isAllCaps = false
            textSize = 17f
            setTextColor(0xFFFFFFFF.toInt())
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(0xFFE8590C.toInt())
                cornerRadius = dp(12).toFloat()
            }
            setPadding(dp(26), dp(12), dp(26), dp(12))
            setOnClickListener {
                errorView.visibility = View.GONE
                val u = web.url
                if (u != null && Policy.sameOrigin(u, base)) web.reload() else web.loadUrl("$base/")
            }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        return col
    }

    private inner class Chrome : WebChromeClient() {
        /** window.open, target=_blank: the site's own addresses in this view, the others in the browser. */
        override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
            val transport = resultMsg.obj as? WebView.WebViewTransport ?: return false
            val probe = WebView(this@MainActivity)
            probe.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                    val u = request.url
                    when (Policy.decide(u.toString(), base, true)) {
                        Policy.Verdict.ALLOW -> if (Policy.sameOrigin(u.toString(), base)) web.loadUrl(u.toString())
                        Policy.Verdict.EXTERNAL -> openOutside(u)
                        Policy.Verdict.BLOCK -> {}
                    }
                    main.post { v.destroy() }
                    return true
                }
            }
            transport.webView = probe
            resultMsg.sendToTarget()
            return true
        }

        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            val accept = params.acceptTypes.filter { it.isNotBlank() }
            val wantsImage = accept.isEmpty() || accept.any { it.startsWith("image") || it == "*/*" }
            val camera = if (wantsImage) cameraIntent() else null
            val target = if (params.isCaptureEnabled && camera != null) {
                camera                                 // <input capture>: straight to the camera
            } else {
                val content = try {
                    params.createIntent()
                } catch (e: Exception) {
                    Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE)
                }
                if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) content.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                // Phones' pickers grey out .gpx / .fit under types they do not know: let any file through.
                if (accept.isEmpty() || accept.any { !it.startsWith("image") }) {
                    content.type = "*/*"
                    content.removeExtra(Intent.EXTRA_MIME_TYPES)
                }
                Intent.createChooser(content, getString(R.string.choose_file)).apply {
                    if (camera != null) putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))
                }
            }
            return try {
                chooser.launch(target)
                true
            } catch (e: ActivityNotFoundException) {
                fileCallback = null
                cameraUri = null
                false
            }
        }

        /** The page's position requests: the system's « while using the app » permission, never more. */
        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            if (!Policy.sameOrigin(origin, base)) { callback.invoke(origin, false, false); return }
            val fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (fine || coarse) { callback.invoke(origin, true, false); return }
            geoPending?.let { it.second.invoke(it.first, false, false) }
            geoPending = origin to callback
            geoPerms.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    private fun cameraIntent(): Intent? = try {
        val dir = File(cacheDir, "camera").apply { mkdirs() }
        dir.listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 24 * 3600_000L) it.delete() }
        val f = File(dir, "photo-" + System.currentTimeMillis() + ".jpg")
        val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
        cameraUri = uri
        Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    } catch (e: Exception) {
        null
    }

    // ---- Downloads: a file served by the site itself. (What a page makes — blob: and data: addresses — it hands over
    // through the bridge's `saveFile`; nothing to do for those here.)

    private fun download(url: String, ua: String?, cd: String?, mime: String?) {
        if (url.startsWith("blob:") || url.startsWith("data:")) return
        if (!Policy.sameOrigin(url, base)) { route(Uri.parse(url), true); return }
        try {
            val name = URLUtil.guessFileName(url, cd, mime)
            val r = DownloadManager.Request(Uri.parse(url))
                .setMimeType(mime)
                .addRequestHeader("User-Agent", ua ?: web.settings.userAgentString)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setTitle(name)
            CookieManager.getInstance().getCookie(url)?.let { r.addRequestHeader("Cookie", it) }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            } else {
                r.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, name)
            }
            (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(r)
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            // not saved
        }
    }
}
