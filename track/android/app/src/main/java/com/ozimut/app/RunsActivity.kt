package com.ozimut.app

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import java.util.concurrent.Executors

/** The runs kept on this phone (docs/track/folloz.md rule 3): each seen on the map, shared or saved as GPX, deleted. */
class RunsActivity : ComponentActivity() {
    private lateinit var root: LinearLayout
    private val ui = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var saving: RunLog.Info? = null

    private val save = registerForActivityResult(ActivityResultContracts.CreateDocument("application/gpx+xml")) { uri ->
        val r = saving ?: return@registerForActivityResult
        if (uri == null) return@registerForActivityResult
        io.execute {
            val ok = try {
                contentResolver.openOutputStream(uri)?.use { it.write(Gpx.write(title(r), RunLog.read(r.file)).toByteArray(Charsets.UTF_8)) } != null
            } catch (e: Exception) { false }
            ui.post { Toast.makeText(this, if (ok) R.string.runs_saved else R.string.runs_save_failed, Toast.LENGTH_LONG).show() }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        root = Ui.column(this)
        Ui.page(this, root)
    }

    override fun onResume() {
        super.onResume()
        load()
    }

    private fun title(r: RunLog.Info) = "Folloz " + Screens.dateTime(this, r.start)

    private fun load() {
        root.removeAllViews()
        root.addView(Ui.full(Ui.text(this, getString(R.string.runs_title), 24f, bold = true)))
        root.addView(Ui.full(Ui.text(this, getString(R.string.runs_text), 14f, color = Ui.GREY)))
        io.execute {
            WatchRuns.collect(applicationContext)          // a watch's runs the system has not handed over yet
            val running = RunState.get(applicationContext).let { if (it.active) it.run else "" }
            val list = RunLog.runs(applicationContext).filter { it.run != running }
            ui.post { show(list) }
        }
    }

    private fun show(list: List<RunLog.Info>) {
        if (list.isEmpty()) {
            root.addView(Ui.full(Ui.text(this, getString(R.string.runs_none), color = Ui.GREY)))
            return
        }
        for (r in list) {
            val card = Ui.column(this, 14).apply { background = Ui.round(Ui.PALE, Ui.dp(this@RunsActivity, 12).toFloat()) }
            card.addView(Ui.text(this, Screens.dateTime(this, r.start), 18f, bold = true))
            card.addView(Ui.text(this, getString(R.string.runs_line, Ui.clock((r.end - r.start) * 1000), Ui.km(r.metres)), 15f, color = Ui.GREY))
            if (r.watch) card.addView(Ui.text(this, getString(R.string.runs_watch), 14f, color = Ui.GREY))
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            fun btn(label: String, onClick: () -> Unit) = row.addView(Ui.button(this, label, onClick = onClick),
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(4, 4, 4, 4) })
            btn(getString(R.string.runs_view)) {
                startActivity(Intent(this, RunViewActivity::class.java).putExtra(RunViewActivity.EXTRA_RUN, r.run))
            }
            btn(getString(R.string.runs_share)) {
                io.execute {
                    val f = RunLog.gpxFile(applicationContext, title(r), RunLog.read(r.file))
                    ui.post { Screens.shareFile(this, f) }
                }
            }
            btn(getString(R.string.runs_save)) {
                saving = r
                save.launch(title(r).replace(Regex("[^\\p{L}\\p{N} _-]"), "-") + ".gpx")
            }
            btn(getString(R.string.runs_delete)) {
                Screens.confirm(this, getString(R.string.runs_delete_ask), getString(R.string.runs_delete)) {
                    RunLog.delete(this, r.run)
                    load()
                }
            }
            card.addView(row)
            root.addView(Ui.full(card))
        }
    }
}

/** One run kept on this phone, on the map. */
class RunViewActivity : ComponentActivity() {
    companion object {
        const val EXTRA_RUN = "run"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val id = intent.getStringExtra(EXTRA_RUN)
        val info = RunLog.runs(this).firstOrNull { it.run == id }
        if (id == null || info == null) {
            finish()
            return
        }
        val fixes = RunLog.read(info.file)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(0xFFFFFFFF.toInt()) }
        Ui.padForBars(root)
        setContentView(root)
        val head = Ui.column(this, 12)
        head.addView(Ui.full(Ui.text(this, Screens.dateTime(this, info.start), 20f, bold = true)))
        head.addView(Ui.full(Ui.text(this, getString(R.string.runs_line, Ui.clock((info.end - info.start) * 1000), Ui.km(info.metres)), 15f, color = Ui.GREY)))
        root.addView(head)
        val frame = FrameLayout(this)
        val map = TileMapView(this).apply {
            follow = false
            trail = fixes
        }
        frame.addView(map, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(frame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        map.post { map.fit(fixes) }
    }
}
