package com.ozimut.app

import android.content.Intent
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.util.concurrent.Executors

/** Pairs this phone: a QR code scanned, or the 8-character code typed (design.md « Pairing a phone »). */
class PairActivity : ComponentActivity() {
    companion object {
        const val EXTRA_CODE = "code"
    }

    private lateinit var field: EditText
    private lateinit var status: TextView
    private var busy = false
    private val io = Executors.newSingleThreadExecutor()

    private val scan = registerForActivityResult(ScanContract()) { r ->
        val code = Pairing.normalise(r.contents)
        if (code != null) {
            field.setText(code)
            pair(code)
        } else if (r.contents != null) {
            status.text = getString(R.string.pair_err_code)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val root: LinearLayout = Ui.column(this)
        Ui.page(this, root)
        root.addView(Ui.full(Ui.text(this, getString(R.string.pair_title), 26f, bold = true)))
        root.addView(Ui.full(Ui.text(this, getString(R.string.pair_intro))))
        root.addView(Ui.full(Ui.button(this, getString(R.string.pair_scan), style = 1, big = true) {
            scan.launch(
                ScanOptions()
                    .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    .setPrompt(getString(R.string.pair_scan_prompt))
                    .setBeepEnabled(false)
                    .setOrientationLocked(false)
            )
        }))
        root.addView(Ui.gap(this, 16))
        field = EditText(this).apply {
            hint = getString(R.string.pair_code_hint)
            textSize = 26f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            filters = arrayOf(InputFilter.AllCaps(), InputFilter.LengthFilter(9))
            imeOptions = EditorInfo.IME_ACTION_GO
            setOnEditorActionListener { _, _, _ -> submit(); true }
        }
        root.addView(Ui.full(field))
        root.addView(Ui.full(Ui.button(this, getString(R.string.pair_go)) { submit() }))
        status = Ui.text(this, "", 16f, color = Ui.GREY)
        root.addView(Ui.full(status))

        Pairing.normalise(intent.getStringExtra(EXTRA_CODE))?.let {
            field.setText(it)
            pair(it)
        }
    }

    private fun submit() {
        val code = Pairing.normalise(field.text.toString())
        if (code == null) {
            status.text = getString(R.string.pair_err_code)
            return
        }
        pair(code)
    }

    private fun pair(code: String) {
        if (busy) return
        if (RunState.get(this).active) {
            status.text = getString(R.string.test_busy)
            return
        }
        busy = true
        status.text = getString(R.string.pair_working)
        io.execute {
            val r = Pairing.pair(applicationContext, code)
            runOnUiThread {
                busy = false
                if (!r.ok) {
                    status.text = Pairing.errorText(this, r.error)
                    return@runOnUiThread
                }
                Toast.makeText(this, getString(R.string.pair_ok, Device.name(this)), Toast.LENGTH_LONG).show()
                // Sign the web view in to the account (design.md « The web view's session »).
                val i = Intent(this, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                if (r.webToken != null) i.putExtra(MainActivity.EXTRA_WEB_TOKEN, r.webToken)
                i.putExtra(MainActivity.EXTRA_AFTER_PAIR, true)
                startActivity(i)
                finish()
            }
        }
    }
}
