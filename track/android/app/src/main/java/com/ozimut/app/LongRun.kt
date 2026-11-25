package com.ozimut.app

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.os.Looper
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/*
 * The phone app's own parts of a long run (docs/track/ozitrac.md « Pace »), not shared with the watch (which is never in long
 * mode and has no Play services location): the fixes batched by Google Play services' fused location, and this phone's push
 * token given to the relay so that a watcher's request for Direct wakes it.
 */

/**
 * A long run's fixes from the fused location: one every `fix` seconds, delivered together about when a batch is due
 * (`maxUpdateDelay`), the processor asleep in between — the location system batches the fixes itself, which the platform's
 * own location does only from Android 12. High accuracy all the same: the balanced level reads Wi-Fi and cell towers, which
 * forests and mountains lack.
 */
class FusedFixes : BatchedFixes {
    private var client: FusedLocationProviderClient? = null
    private var callback: LocationCallback? = null

    @SuppressLint("MissingPermission") // TrackerService checks the location permission before
    override fun start(
        c: Context, fixMs: Long, maxDelayMs: Long, looper: Looper,
        onFixes: (List<Location>) -> Unit, onFailed: () -> Unit,
    ): Boolean {
        if (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(c) != ConnectionResult.SUCCESS) return false
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, fixMs)
            .setMinUpdateIntervalMillis(fixMs)
            .setMaxUpdateDelayMillis(maxDelayMs)
            .setWaitForAccurateLocation(false)
            .build()
        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                onFixes(result.locations)
            }
        }
        val fl = LocationServices.getFusedLocationProviderClient(c)
        client = fl
        callback = cb
        fl.requestLocationUpdates(req, cb, looper).addOnFailureListener { onFailed() }
        return true
    }

    override fun stop() {
        val cb = callback ?: return
        try { client?.removeLocationUpdates(cb) } catch (e: Exception) { /* already off */ }
        callback = null
        client = null
    }
}

/** This phone's push token on its own channel (`PUT /<c>/token`): sent when it changed, dropped when there is none. */
object OwnPush {
    /** Off the main thread; does nothing without a channel. */
    fun sync(c: Context) {
        val app = c.applicationContext
        if (!Channel.exists(app)) return
        PushSupport.token(app) { t -> Thread { Channel.setToken(app, t) }.start() }
    }
}
