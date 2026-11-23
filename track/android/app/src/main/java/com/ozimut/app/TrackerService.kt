package com.ozimut.app

import android.Manifest
import android.app.Notification
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import kotlin.math.roundToInt

/**
 * The run: a foreground service of type « location », started only from the visible Start screen.
 * One GPS fix a second (the platform's GPS provider, no Play Services), each written at once to the run's file on the phone
 * (RunLog) and to the queue of each destination: Ozimut's account when the phone is linked (Uploader), Ozitrac's relay when
 * someone follows (RelaySender; docs/track/ozitrac.md). The run ends once every destination has sent its last batch.
 * START_STICKY and the state in SharedPreferences bring an open run back after the process was killed. Also runs the
 * two-minute self-test (no queue, no sending).
 */
class TrackerService : Service(), LocationListener {
    companion object {
        const val ACTION_START = "com.ozimut.app.START"
        const val ACTION_STOP = "com.ozimut.app.STOP"
        const val ACTION_HELP = "com.ozimut.app.HELP"
        const val ACTION_RESUME = "com.ozimut.app.RESUME"
        const val ACTION_TEST = "com.ozimut.app.TEST"
        const val ACTION_TEST_CANCEL = "com.ozimut.app.TEST_CANCEL"
        @Volatile var running = false
            private set
        @Volatile var testing = false
            private set
        /** Fixes worse than this are kept (their accuracy says so) but not counted in the distance. */
        const val GOOD_FOR_DISTANCE = 30
        const val LOW_BATTERY = 15
    }

    private val main = Handler(Looper.getMainLooper())
    private lateinit var store: FixDb
    private var uploader: Uploader? = null
    private var relay: RelaySender? = null
    private var alertWatch: AlertWatch? = null
    private var gpsThread: HandlerThread? = null
    private var gpsOn = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastT = 0L
    private var prev: Fix? = null
    private var mode = "" // "run" | "test"

    private val capCheck = object : Runnable {
        override fun run() {
            val c = this@TrackerService
            val s = RunState.get(c)
            if (s.state == RunState.RUNNING && System.currentTimeMillis() - s.started >= s.cap * 1000L) { endRun(); return }
            if (s.state != RunState.RUNNING) return
            // a channel made during the run (a first code shown): the relay joins from now on
            if (s.share == "watchers" && RunState.RELAY !in s.dests && Channel.exists(c)) {
                RunState.setDests(c, s.dests + RunState.RELAY)
                startSenders()
                relay?.kick()
            }
            val bat = Phone.battery(c)
            if (bat != null && bat < LOW_BATTERY && RunState.RELAY in s.dests && RunState.once(c, "battery")) {
                Alerts.add(c, Alerts.BATTERY)
                relay?.kick()
            }
            main.postDelayed(this, 10_000)
        }
    }

    private val testCheck = object : Runnable {
        override fun run() {
            if (SelfTest.check(this@TrackerService)) finishTest() else main.postDelayed(this, 1_000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        store = FixDb.get(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TEST -> startTest()
            ACTION_TEST_CANCEL -> { SelfTest.reset(this); finishTest() }
            ACTION_START -> resume()
            ACTION_STOP -> {
                if (!running) resume()
                endRun()
            }
            ACTION_HELP -> {
                if (!running) resume()
                uploader?.kick()
                relay?.kick()
            }
            else -> resume() // ACTION_RESUME, or a restart after the process was killed (null intent)
        }
        return START_STICKY
    }

    private fun foreground(n: Notification): Boolean = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(Notifs.ID_RUN, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(Notifs.ID_RUN, n)
        }
        true
    } catch (e: Exception) {
        false // a location service may not start from the background (Android 12+): the user brings it back
    }

    /** Starts or takes back the open run. */
    private fun resume() {
        if (mode == "test") return
        val s = RunState.get(this)
        if (!s.active) {
            if (!running) stopSelf()
            return
        }
        val n = if (s.state == RunState.RUNNING) Notifs.run(this, s.started) else Notifs.sending(this)
        if (!foreground(n)) {
            Notifs.resume(this)
            stopSelf()
            return
        }
        mode = "run"
        running = true
        if (alertWatch == null) alertWatch = AlertWatch(this) { relay?.kick() }
        startSenders()
        holdWakeLock()
        if (s.state == RunState.RUNNING) {
            startGps()
            main.removeCallbacks(capCheck)
            main.post(capCheck)
            uploader?.kickIn(3_000)
            relay?.kick()
        } else {
            uploader?.kick()
            relay?.kick()
            if (RunState.get(this).dests.isEmpty()) main.post { finishRun() }
        }
        Tracker.changed()
    }

    /** Starts the sender of each destination of the run not yet started (and drops a destination that no longer exists). */
    private fun startSenders() {
        val c = this
        var dests = RunState.get(c).dests
        if (RunState.OZ in dests && !Device.paired(c)) dests = dests - RunState.OZ
        if (RunState.RELAY in dests && !Channel.exists(c)) dests = dests - RunState.RELAY
        if (dests != RunState.get(c).dests) RunState.setDests(c, dests)
        if (RunState.OZ in dests && uploader == null) {
            uploader = Uploader(c, store, object : Uploader.Events {
                override fun onFinished(how: String) {
                    main.post { destDone(RunState.OZ) }
                }
                override fun onServerStop() {
                    RunState.setState(c, RunState.ENDING)
                    main.post { endRun() }
                }
                override fun onDeviceRemoved() {
                    // the phone was removed from the Ozimut account: the run goes on without it
                    Device.forget(c)
                    store.drop(RunState.get(c).run)
                    main.post { destDone(RunState.OZ) }
                }
            }).also { it.start() }
        }
        if (RunState.RELAY in dests && relay == null) {
            relay = RelaySender(c, store, object : Uploader.Events {
                override fun onFinished(how: String) {
                    main.post { destDone(RunState.RELAY) }
                }
                override fun onServerStop() {}
                override fun onDeviceRemoved() {
                    main.post { destDone(RunState.RELAY) }
                }
            })
        }
    }

    /** One destination has sent its last batch (or is gone): the run ends when none is left. */
    private fun destDone(dest: String) {
        val s = RunState.get(this)
        RunState.setDests(this, s.dests - dest)
        when (dest) {
            RunState.OZ -> { uploader?.quit(); uploader = null }
            RunState.RELAY -> { relay?.quit(); relay = null }
        }
        if (s.state == RunState.ENDING && RunState.get(this).dests.isEmpty()) finishRun()
        Tracker.changed()
    }

    private fun endRun() {
        stopGps()
        main.removeCallbacks(capCheck)
        val s = RunState.get(this)
        if (s.state == RunState.RUNNING) RunState.setState(this, RunState.ENDING)
        if (RunState.get(this).dests.isEmpty()) {
            finishRun()
            return
        }
        foreground(Notifs.sending(this))
        uploader?.kick()
        relay?.kick()
        Tracker.changed()
    }

    private fun finishRun() {
        RunState.setState(this, RunState.ENDED)
        shutDown()
    }

    private fun shutDown() {
        stopGps()
        main.removeCallbacks(capCheck)
        uploader?.quit()
        uploader = null
        relay?.quit()
        relay = null
        alertWatch = null
        releaseWakeLock()
        running = false
        mode = ""
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Tracker.changed()
    }

    private fun startTest() {
        if (running) return
        SelfTest.begin(this)
        if (!foreground(Notifs.test(this))) {
            stopSelf()
            return
        }
        mode = "test"
        testing = true
        lastT = 0
        holdWakeLock()
        startGps()
        main.removeCallbacks(testCheck)
        main.postDelayed(testCheck, 1_000)
    }

    private fun finishTest() {
        main.removeCallbacks(testCheck)
        testing = false
        if (mode == "test") {
            stopGps()
            releaseWakeLock()
            mode = ""
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
        Tracker.changed()
    }

    private fun startGps() {
        if (gpsOn) return
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        val lm = getSystemService(LOCATION_SERVICE) as? LocationManager ?: return
        val t = HandlerThread("ozimut-gps").apply { start() }
        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this, t.looper)
            gpsThread = t
            gpsOn = true
        } catch (e: Exception) {
            t.quitSafely()
        }
    }

    private fun stopGps() {
        if (!gpsOn) return
        try {
            (getSystemService(LOCATION_SERVICE) as LocationManager).removeUpdates(this)
        } catch (e: Exception) {
            // already off
        }
        gpsThread?.quitSafely()
        gpsThread = null
        gpsOn = false
    }

    private fun holdWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ozimut:run").apply {
            setReferenceCounted(false)
            acquire(26 * 3600 * 1000L)
        }
    }

    private fun releaseWakeLock() {
        try { wakeLock?.let { if (it.isHeld) it.release() } } catch (e: Exception) { /* released */ }
        wakeLock = null
    }

    override fun onLocationChanged(loc: Location) {
        val now = System.currentTimeMillis()
        // The fix's own (GPS) time, unless the phone's GPS clock is plainly wrong.
        val ms = if (kotlin.math.abs(loc.time - now) < 86_400_000L) loc.time else now
        val t = ms / 1000
        if (t <= lastT) return
        lastT = t
        if (mode == "test") {
            SelfTest.record(this, t)
            return
        }
        val s = RunState.get(this)
        if (s.state != RunState.RUNNING) return
        val acc = if (loc.hasAccuracy()) loc.accuracy.roundToInt().coerceIn(0, 99_999) else 99_999
        val fix = Fix(
            t, (loc.latitude * 1e6).roundToInt(), (loc.longitude * 1e6).roundToInt(), acc,
            if (loc.hasAltitude()) loc.altitude.roundToInt() else null
        )
        RunLog.append(this, s.run, fix)
        for (d in s.dests) store.add(RunState.queueKey(d, s.run), fix)
        alertWatch?.onFix(fix, s.started / 1000)
        var add = 0.0
        if (acc <= GOOD_FOR_DISTANCE) {
            prev?.let { p -> add = Tracker.haversine(p.la, p.lo, fix.la, fix.lo) }
            prev = fix
        }
        RunState.onFix(this, add, acc)
        Tracker.changed()
    }

    override fun onProviderEnabled(provider: String) {}

    override fun onProviderDisabled(provider: String) {}

    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

    override fun onDestroy() {
        stopGps()
        main.removeCallbacksAndMessages(null)
        uploader?.quit()
        uploader = null
        relay?.quit()
        relay = null
        releaseWakeLock()
        running = false
        testing = false
        super.onDestroy()
    }
}
