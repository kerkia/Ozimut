package com.ozimut.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import kotlin.math.roundToInt

/**
 * The zone set on this phone (docs/track/ozitrac.md rule 5): its centre is the map's centre (the cross), « Ma position » brings
 * the map to where the phone is; a radius; leaving it during a run alerts the watchers.
 */
class ZoneActivity : ComponentActivity() {
    private lateinit var map: TileMapView
    private lateinit var radius: EditText
    private lateinit var on: CheckBox

    private val perms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        if (r[Manifest.permission.ACCESS_FINE_LOCATION] == true) locate()
    }

    private val once = object : LocationListener {
        override fun onLocationChanged(l: Location) {
            map.setView(l.latitude, l.longitude, maxOf(map.zoom, 15.0))
            stopListening()
        }
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
        @Deprecated("Deprecated in Java")
        @Suppress("DEPRECATION")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val z = Zone.get(this)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(0xFFFFFFFF.toInt()) }
        Ui.padForBars(root)
        setContentView(root)
        val head = Ui.column(this, 12)
        head.addView(Ui.full(Ui.text(this, getString(R.string.zone_title), 22f, bold = true)))
        head.addView(Ui.full(Ui.text(this, getString(R.string.zone_text), 14f, color = Ui.GREY)))
        root.addView(head)

        val frame = FrameLayout(this)
        map = TileMapView(this).apply {
            follow = false
            crosshair = true
        }
        frame.addView(map, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(frame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        if (z.la != 0 || z.lo != 0) {
            map.setView(z.la / 1e6, z.lo / 1e6, 15.0)
            map.zoneCentre = z.la to z.lo
            map.zoneRadius = z.r
        } else {
            map.setView(46.6, 2.4, 5.0)
            lastKnown()?.let { map.setView(it.latitude, it.longitude, 15.0) }
        }

        val foot = Ui.column(this, 12)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        row.addView(Ui.text(this, getString(R.string.zone_radius)), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        radius = EditText(this).apply {
            setText(z.r.toString())
            inputType = InputType.TYPE_CLASS_NUMBER
            setSingleLine()
            minWidth = Ui.dp(this@ZoneActivity, 100)
        }
        row.addView(radius)
        foot.addView(Ui.full(row))
        on = CheckBox(this).apply { text = getString(R.string.zone_alert); textSize = 16f; isChecked = z.on }
        foot.addView(Ui.full(on))
        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        buttons.addView(Ui.button(this, getString(R.string.zone_here)) { locate() },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = Ui.dp(this@ZoneActivity, 4) })
        buttons.addView(Ui.button(this, getString(R.string.zone_save), style = 1) { save() },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = Ui.dp(this@ZoneActivity, 4) })
        foot.addView(buttons)
        root.addView(foot)
    }

    private fun hasLocation() = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    private fun lastKnown(): Location? {
        if (!hasLocation()) return null
        val lm = getSystemService(LOCATION_SERVICE) as? LocationManager ?: return null
        return try {
            listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
                .mapNotNull { lm.getLastKnownLocation(it) }.maxByOrNull { it.time }
        } catch (e: Exception) { null }
    }

    @SuppressLint("MissingPermission")
    private fun locate() {
        if (!hasLocation()) {
            perms.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            return
        }
        lastKnown()?.let { map.setView(it.latitude, it.longitude, maxOf(map.zoom, 15.0)) }
        try {
            (getSystemService(LOCATION_SERVICE) as LocationManager)
                .requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, once, Looper.getMainLooper())
        } catch (e: Exception) { /* no GPS */ }
    }

    private fun stopListening() {
        try { (getSystemService(LOCATION_SERVICE) as LocationManager).removeUpdates(once) } catch (e: Exception) { /* off */ }
    }

    override fun onPause() {
        super.onPause()
        stopListening()
    }

    private fun save() {
        val r = radius.text.toString().trim().toIntOrNull()
        if (r == null || r < 50) {
            Toast.makeText(this, R.string.zone_radius_bad, Toast.LENGTH_LONG).show()
            return
        }
        val (lat, lon) = map.centre()
        Zone.set(this, on.isChecked, (lat * 1e6).roundToInt(), (lon * 1e6).roundToInt(), r)
        Toast.makeText(this, R.string.zone_saved, Toast.LENGTH_SHORT).show()
        finish()
    }
}
