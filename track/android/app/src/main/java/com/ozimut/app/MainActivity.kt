package com.ozimut.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/** The whole live site in a web view, plus the bridge to the native side. */
class MainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_WEB_TOKEN = "webToken"
        const val EXTRA_AFTER_PAIR = "afterPair"
        private val PAIR_PATH = Regex("^/t/([A-Za-z0-9]{8})/?$")
    }

    private lateinit var web: WebView
    private lateinit var bridge: Bridge
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var pageReady = false
    private val pending = ArrayDeque<String>()
    private var delivering = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null
    private var lastTracker = ""
    private var geoPending: Pair<String, GeolocationPermissions.Callback>? = null
    private var pushPending: ((Any) -> Unit)? = null
    private val trackerListener = Runnable { emitTracker() }

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
        val ok = r.values.any { it }
        p.second.invoke(p.first, ok, false)
    }

    private val notifPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val cb = pushPending ?: return@registerForActivityResult
        pushPending = null
        if (granted) fetchPushToken(cb) else cb(JSONObject().put("ok", false).put("reason", "denied"))
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Tracker.ensureService(this)
        val i = intent
        if (onlyTracker() && i.getStringExtra(EXTRA_WEB_TOKEN) == null && pairCodeOf(i) == null) {
            startActivity(Intent(this, TrackerActivity::class.java))
            finish()
            return
        }
        enableEdgeToEdge()
        web = WebView(this)
        val frame = android.widget.FrameLayout(this)
        frame.addView(web, android.widget.FrameLayout.LayoutParams(-1, -1))
        Ui.padForBars(frame)
        setContentView(frame)

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = false
        s.allowContentAccess = true
        s.mediaPlaybackRequiresUserGesture = true
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        s.setGeolocationEnabled(true)
        s.userAgentString = s.userAgentString + " OzimutApp/" + BuildConfig.VERSION_NAME + " (android)"
        CookieManager.getInstance().setAcceptCookie(true)

        bridge = Bridge(this)
        web.addJavascriptInterface(bridge, "OzimutNative")
        web.webViewClient = Client()
        web.webChromeClient = Chrome()
        web.setDownloadListener { url, ua, cd, mime, _ -> download(url, ua, cd, mime) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState != null && web.restoreState(savedInstanceState) != null) {
            handleIntent(i, initial = false)
        } else {
            handleIntent(i, initial = true)
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
        if (!::web.isInitialized) return
        Tracker.listen(trackerListener)
        web.onResume()
        emitTracker()
    }

    override fun onPause() {
        super.onPause()
        if (!::web.isInitialized) return
        Tracker.unlisten(trackerListener)
        web.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        if (::web.isInitialized) {
            web.removeJavascriptInterface("OzimutNative")
            web.destroy()
        }
        super.onDestroy()
    }

    private fun onlyTracker() = Device.paired(this) && Device.settings(this).onlyTracker

    // ---- Intents

    private fun pairCodeOf(i: Intent?): String? {
        if (i?.action != Intent.ACTION_VIEW) return null
        val d = i.data ?: return null
        return when (d.scheme) {
            "ozimut" -> Pairing.normalise(d.toString())
            "https", "http" -> if (isOurs(d) && PAIR_PATH.matches(d.path ?: "")) Pairing.normalise(d.path) else null
            else -> null
        }
    }

    private fun handleIntent(i: Intent, initial: Boolean) {
        var loaded = false
        i.getStringExtra(EXTRA_WEB_TOKEN)?.let {
            web.loadUrl(Pairing.loginUrl(it))
            loaded = true
            i.removeExtra(EXTRA_WEB_TOKEN)
        }
        if (i.getBooleanExtra(EXTRA_AFTER_PAIR, false)) {
            i.removeExtra(EXTRA_AFTER_PAIR)
            emitTracker()
            if (onlyTracker() || Device.account(this)?.optBoolean("child", false) == true) {
                startActivity(Intent(this, TrackerActivity::class.java))
            }
        }
        i.getStringExtra(EXTRA_URL)?.let { url ->
            i.removeExtra(EXTRA_URL)
            val u = Uri.parse(url)
            val target = if (u.scheme == null) Http.base() + (if (url.startsWith("/")) url else "/$url") else url
            if (isOurs(Uri.parse(target))) {
                web.loadUrl(target)
                loaded = true
            }
            queue(JSONObject().put("type", "push").put("url", url))
        }
        when (i.action) {
            Intent.ACTION_VIEW -> {
                val d = i.data
                val code = pairCodeOf(i)
                if (code != null) {
                    startActivity(Intent(this, PairActivity::class.java).putExtra(PairActivity.EXTRA_CODE, code))
                } else if (d != null && (d.scheme == "https" || d.scheme == "http") && isOurs(d)) {
                    web.loadUrl(d.toString())
                    loaded = true
                } else if (d != null && (d.scheme == "content" || d.scheme == "file")) {
                    readFiles(listOf(d), i.type)
                }
            }
            Intent.ACTION_SEND -> {
                @Suppress("DEPRECATION")
                val u = i.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                if (u != null) readFiles(listOf(u), i.type)
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                @Suppress("DEPRECATION")
                val list = i.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
                if (!list.isNullOrEmpty()) readFiles(list, i.type)
            }
        }
        if (initial && !loaded) {
            web.loadUrl(Http.base() + "/")
            signInIfNeeded()
        }
    }

    /** A paired phone whose web view has no session (a child's phone, cookies cleared) is signed in to its account. */
    private fun signInIfNeeded() {
        if (!Device.paired(this)) return
        val cookies = CookieManager.getInstance().getCookie(Http.base())
        if (!cookies.isNullOrBlank()) return
        io.execute {
            val token = Pairing.webToken(applicationContext) ?: return@execute
            runOnUiThread { web.loadUrl(Pairing.loginUrl(token)) }
        }
    }

    private fun readFiles(uris: List<Uri>, type: String?) {
        io.execute {
            for (u in uris) {
                val e = Files.eventOf(applicationContext, u, type) ?: continue
                runOnUiThread { queue(e) }
            }
        }
    }

    // ---- Events to the page

    fun js(code: String) {
        if (::web.isInitialized) web.evaluateJavascript(code, null)
    }

    /** Native → site events, held until the page (and its __ozApp) is there. */
    private fun queue(e: JSONObject) {
        pending.addLast(e.toString())
        deliver()
    }

    private fun deliver(tries: Int = 0) {
        if (delivering || pending.isEmpty() || !::web.isInitialized) return
        if (!pageReady) return
        delivering = true
        val ev = pending.first()
        web.evaluateJavascript(
            "(function(e){if(window.__ozApp&&window.__ozApp.event){window.__ozApp.event(e);return 1}return 0})($ev)"
        ) { r ->
            delivering = false
            if (r == "1") {
                pending.removeFirstOrNull()
                deliver()
            } else if (tries < 40) {
                main.postDelayed({ deliver(tries + 1) }, 500)
            } else {
                pending.removeFirstOrNull() // the page has no bridge: drop it
                deliver()
            }
        }
    }

    fun emitTracker() {
        if (!::web.isInitialized) return
        val st = Tracker.stateJson(this)
        val key = st.optString("state") + "|" + st.optString("run")
        if (key == lastTracker) return
        lastTracker = key
        if (!pageReady) return
        queue(JSONObject().put("type", "tracker").put("state", st.optString("state")).put("run", st.opt("run")))
    }

    fun onOurPage(): Boolean {
        val u = web.url ?: return false
        return isOurs(Uri.parse(u))
    }

    fun afterBridgePair(r: Pairing.Result) {
        emitTracker()
        // A child's phone: the web view becomes the child's (the phone is theirs).
        if (r.child && r.webToken != null) web.loadUrl(Pairing.loginUrl(r.webToken))
        if (onlyTracker()) startActivity(Intent(this, TrackerActivity::class.java))
    }

    fun pushRegister(cb: (Any) -> Unit) {
        if (!PushSupport.AVAILABLE) { cb(JSONObject().put("ok", false).put("reason", "unconfigured")); return }
        if (!Device.paired(this)) { cb(JSONObject().put("ok", false).put("reason", "unpaired")); return }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            pushPending = cb
            notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        fetchPushToken(cb)
    }

    private fun fetchPushToken(cb: (Any) -> Unit) {
        PushSupport.token(applicationContext) { token ->
            if (token == null) {
                runOnUiThread { cb(JSONObject().put("ok", false).put("reason", "token")) }
                return@token
            }
            io.execute {
                val ok = PushTokens.send(applicationContext, token)
                runOnUiThread { cb(JSONObject().put("ok", ok)) }
            }
        }
    }

    // ---- Links

    private fun isOurs(u: Uri): Boolean {
        val h = u.host ?: return false
        return h == Http.host() || h == "ozimut.com" || h == "www.ozimut.com" || h == "ocn.kerkia.com"
    }

    private fun openOutside(u: Uri) {
        try {
            val i = if (u.scheme == "intent") Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) else Intent(Intent.ACTION_VIEW, u)
            i.addCategory(Intent.CATEGORY_BROWSABLE)
            i.component = null
            i.selector = null
            startActivity(i)
        } catch (e: Exception) {
            // nothing can open it
        }
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val u = request.url
            val scheme = u.scheme ?: return false
            if (scheme == "http" || scheme == "https") {
                if (!isOurs(u)) {
                    if (!request.isForMainFrame) return false
                    openOutside(u)
                    return true
                }
                val m = PAIR_PATH.matchEntire(u.path ?: "")
                if (m != null && request.isForMainFrame) {
                    startActivity(Intent(this@MainActivity, PairActivity::class.java).putExtra(PairActivity.EXTRA_CODE, m.groupValues[1]))
                    return true
                }
                return false
            }
            if (scheme == "blob" || scheme == "data" || scheme == "about" || scheme == "javascript") return false
            openOutside(u)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            pageReady = false
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (url == null || !isOurs(Uri.parse(url))) return
            view.evaluateJavascript(DOWNLOAD_HOOK, null)
            pageReady = true
            lastTracker = ""
            emitTracker()
            main.postDelayed({ deliver() }, 300)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            val html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>" +
                "<body style='font-family:sans-serif;padding:32px;color:#1f2933'><h2>" +
                esc(getString(R.string.net_offline_title)) + "</h2><p>" + esc(getString(R.string.net_offline_text)) +
                "</p><p><a style='display:inline-block;padding:14px 22px;background:#e8590c;color:#fff;border-radius:10px;text-decoration:none' href='" +
                Http.base() + "/'>" + esc(getString(R.string.net_retry)) + "</a></p></body>"
            view.loadDataWithBaseURL(Http.base() + "/", html, "text/html", "utf-8", null)
        }
    }

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    private inner class Chrome : WebChromeClient() {
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            val accept = params.acceptTypes.filter { it.isNotBlank() }
            val wantsImage = accept.isEmpty() || accept.any { it.startsWith("image") || it == "*/*" }
            val camera = if (wantsImage) cameraIntent() else null
            val target = if (params.isCaptureEnabled && camera != null) {
                camera
            } else {
                val content = try {
                    params.createIntent()
                } catch (e: Exception) {
                    Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE)
                }
                if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) content.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                // Phones' pickers grey out .gpx/.fit for unknown types: let any file through.
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

        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            if (!isOurs(Uri.parse(origin))) { callback.invoke(origin, false, false); return }
            val fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (fine || coarse) { callback.invoke(origin, true, false); return }
            geoPending = origin to callback
            geoPerms.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    private fun cameraIntent(): Intent? = try {
        val dir = File(cacheDir, "camera").apply { mkdirs() }
        val f = File(dir, "photo-" + System.currentTimeMillis() + ".jpg")
        val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
        cameraUri = uri
        Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    } catch (e: Exception) {
        null
    }

    // ---- Downloads

    private fun download(url: String, ua: String?, cd: String?, mime: String?) {
        when {
            url.startsWith("blob:") -> web.evaluateJavascript(blobFetch(url), null)
            url.startsWith("data:") -> {
                val name = URLUtil.guessFileName(url, cd, mime)
                io.execute { Files.saveDataUrl(applicationContext, url, name) }
            }
            else -> try {
                val name = URLUtil.guessFileName(url, cd, mime)
                val r = DownloadManager.Request(Uri.parse(url))
                    .setMimeType(mime)
                    .addRequestHeader("User-Agent", ua ?: Http.userAgent())
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
                openOutside(Uri.parse(url))
            }
        }
    }

    private fun blobFetch(url: String): String {
        val q = JSONObject.quote(url)
        return "(function(u){var a=window.__ozLastDl||{};var n=(a.href===u&&a.name)||'';" +
            "fetch(u).then(function(r){return r.blob()}).then(function(b){var f=new FileReader();" +
            "f.onload=function(){var s=String(f.result);OzimutNative.saveFile(n,b.type||'',s.substring(s.indexOf(',')+1))};" +
            "f.readAsDataURL(b)})})($q)"
    }
}

/** Remembers the name of the file a page downloads through <a download> (a blob: address carries none). */
private const val DOWNLOAD_HOOK =
    "(function(){if(window.__ozDlHook)return;window.__ozDlHook=1;" +
        "function k(a){try{if(a&&a.hasAttribute&&a.hasAttribute('download'))window.__ozLastDl={href:a.href,name:a.getAttribute('download')||''}}catch(e){}}" +
        "var c=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){k(this);return c.apply(this,arguments)};" +
        "document.addEventListener('click',function(e){var t=e.target;k(t&&t.closest?t.closest('a[download]'):null)},true)})()"
