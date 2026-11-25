package com.ozimut.app

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.location.LocationRequest
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import java.util.concurrent.Executor
import kotlin.math.roundToInt

/**
 * The run: a foreground service of type « location », started only from the visible Start screen.
 * Each fix is written at once to the run's file on the phone (RunLog) and to the queue of each destination: Ozimut's account
 * when the phone is linked (Uploader), Ozitrac's relay when someone follows (RelaySender; docs/track/ozitrac.md). The run ends
 * once every destination has sent its last batch. START_STICKY and the state in SharedPreferences bring an open run back after
 * the process was killed. Also runs the two-minute self-test (no queue, no sending).
 *
 * Two paces (docs/track/ozitrac.md « Pace »). **Direct**: one GPS fix a second (the platform's GPS provider), the processor
 * kept awake, the senders on their own timers. **A long run**: one fix every 15-60 s, delivered together by the location system
 * about when a batch is due ([BatchedFixes], else the platform's batching) so that the processor sleeps in between; no lasting
 * wake lock but a short one around each sending, which the delivery of fixes, an alarm (in case no fix comes), help, the end
 * and a network back start. A watcher's request for Direct turns a long run into Direct until its end (PaceState).
 */
class TrackerService : Service(), LocationListener {
    companion object {
        const val ACTION_START = "com.ozimut.app.START"
        const val ACTION_STOP = "com.ozimut.app.STOP"
        const val ACTION_HELP = "com.ozimut.app.HELP"
        const val ACTION_RESUME = "com.ozimut.app.RESUME"
        const val ACTION_TEST = "com.ozimut.app.TEST"
        const val ACTION_TEST_CANCEL = "com.ozimut.app.TEST_CANCEL"
        /** A watcher's request for Direct heard (PaceState.offer): settle it. */
        const val ACTION_PACE = "com.ozimut.app.PACE"
        /** A long run's alarm: send if a batch is due, though no fix came to wake the phone. */
        const val ACTION_WAKE = "com.ozimut.app.WAKE"
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
    /** The GPS's pace while on: true one fix a second, false a long run's. */
    @Volatile private var gpsLive = true
    private var batched: BatchedFixes? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var sendLock: PowerManager.WakeLock? = null
    private var netCallback: ConnectivityManager.NetworkCallback? = null
    /** When a long run's senders were last started (elapsed realtime). */
    private var lastSendKick = 0L
    private var lastT = 0L
    private var prev: Fix? = null
    @Volatile private var mode = "" // "run" | "test"

    private val capCheck = object : Runnable {
        override fun run() {
            if (tick()) main.postDelayed(this, 10_000)
        }
    }

    /**
     * The run's clock: the cap, a channel made meanwhile, the low battery, a watcher's request over. Every 10 s while the
     * processor is awake, and at each delivery of fixes and alarm of a long run. False once the run no longer runs.
     */
    private fun tick(): Boolean {
        val c = this
        val s = RunState.get(c)
        if (s.state == RunState.RUNNING && System.currentTimeMillis() - s.started >= s.cap * 1000L) { endRun(); return false }
        if (s.state != RunState.RUNNING) return false
        // a channel made during the run (a first code shown): the relay joins from now on
        if (s.share == "watchers" && RunState.RELAY !in s.dests && Channel.exists(c)) {
            RunState.setDests(c, s.dests + RunState.RELAY)
            startSenders()
            kickSenders()
        }
        val bat = Phone.battery(c)
        if (bat != null && bat < LOW_BATTERY && RunState.RELAY in s.dests && RunState.once(c, "battery")) {
            Alerts.add(c, Alerts.BATTERY)
            kickSenders()
        }
        settlePace()
        return true
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
                kickSenders()
            }
            ACTION_PACE -> {
                if (!running) resume()
                if (mode == "run") settlePace()
            }
            ACTION_WAKE -> {
                if (!running) resume()
                if (mode == "run" && tick()) sendIfDue()
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
        if (s.state == RunState.RUNNING) PaceState.settle(this, nowSec(), Phone.battery(this))
        val n = if (s.state == RunState.RUNNING) runNotification() else Notifs.sending(this)
        if (!foreground(n)) {
            Notifs.resume(this)
            stopSelf()
            return
        }
        mode = "run"
        running = true
        if (alertWatch == null) alertWatch = AlertWatch(this) { main.post { if (running && mode == "run") kickSenders() } }
        startSenders()
        watchNetwork()
        if (s.state == RunState.RUNNING) {
            pace()
            main.removeCallbacks(capCheck)
            main.post(capCheck)
            if (live()) {
                uploader?.kickIn(3_000)
                relay?.kick()
            } else {
                kickSenders()
            }
        } else {
            holdWakeLock()
            uploader?.kick()
            relay?.kick()
            if (RunState.get(this).dests.isEmpty()) main.post { finishRun() }
        }
        Tracker.changed()
    }

    // ---- the pace

    private fun nowSec() = System.currentTimeMillis() / 1000

    /** Direct now: a Direct run, or a long run while a watcher's request holds. */
    private fun live() = PaceState.live(this, nowSec())

    /** The running notification: the pace and, in Direct for a watcher, until when and who asked (the name held for them). */
    private fun runNotification(): Notification {
        val now = nowSec()
        val p = PaceState.now(this, now, 0)
        val asker = if (p.boosted(now)) Channel.watchers(this).firstOrNull { it.w == p.by }?.name?.takeIf { it.isNotBlank() } else null
        return Notifs.run(this, RunState.get(this).started, p, asker)
    }

    /** Puts the GPS, the wake lock, the alarm and the running notification in step with the pace. */
    private fun pace() {
        val live = live()
        if (live) {
            holdWakeLock()
            cancelWake()
        } else {
            releaseWakeLock()
            scheduleWake()
        }
        if (!gpsOn || gpsLive != live) {
            stopGps()
            startGps(live)
        }
        if (running && RunState.get(this).state == RunState.RUNNING) {
            try {
                getSystemService(NotificationManager::class.java)?.notify(Notifs.ID_RUN, runNotification())
            } catch (e: SecurityException) {
                // notifications refused: the run goes on
            }
        }
    }

    /**
     * A watcher's request waiting, or one over: Direct, or the long pace again, then a batch at once so that the watchers see
     * the pace kept (docs/track/ozitrac.md « Pace »: within 15 s). A refusal is sent too: its batch says the long pace.
     */
    private fun settlePace() {
        if (mode != "run" || RunState.get(this).state != RunState.RUNNING) return
        val s = PaceState.settle(this, nowSec(), Phone.battery(this))
        if (s.liveBefore != s.liveAfter || s.changed || (gpsOn && gpsLive != s.liveAfter)) pace()
        if (s.handled || s.liveBefore != s.liveAfter) kickSenders()
        if (s.handled || s.changed) Tracker.changed()
    }

    /** Starts both senders now; in a long run a short wake lock keeps the processor awake while they send. */
    private fun kickSenders() {
        if (mode == "run" && !live()) {
            holdSendLock()
            lastSendKick = SystemClock.elapsedRealtime()
            scheduleWake()
        }
        uploader?.kick()
        relay?.kick()
    }

    /** A long run: sends when its batch is due (fixes just delivered, or the alarm). */
    private fun sendIfDue() {
        if (live()) return
        val ch = PaceState.choice(this)
        // a delivery may come a little early; one much earlier (another app asked for the location) waits for the next
        val margin = minOf(maxOf(30_000L, ch.fix * 1000L), ch.send * 250L)
        if (lastSendKick == 0L || SystemClock.elapsedRealtime() - lastSendKick >= ch.send * 1000L - margin) kickSenders()
    }

    private fun wakeIntent(): PendingIntent = PendingIntent.getService(
        this, 7, Intent(this, TrackerService::class.java).setAction(ACTION_WAKE),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    /**
     * A long run's alarm, a minute after a batch is due: the fixes' delivery normally starts the sending, but none comes when
     * the GPS sees nothing (a tunnel, a cave). Inexact: no exact-alarm permission, and Doze lets one through every 9 minutes.
     */
    private fun scheduleWake() {
        val am = getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val ms = PaceState.choice(this).send * 1000L + 60_000L
        try {
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + ms, wakeIntent())
        } catch (e: Exception) {
            // no alarm: the fixes' delivery still sends
        }
    }

    private fun cancelWake() {
        try { (getSystemService(Context.ALARM_SERVICE) as? AlarmManager)?.cancel(wakeIntent()) } catch (e: Exception) { /* none */ }
    }

    /** A network back after a failure sends at once (the relay's sender has no callback of its own). */
    private fun watchNetwork() {
        if (netCallback != null) return
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (RunState.get(this@TrackerService).failing) main.post { if (running && mode == "run") kickSenders() }
            }
        }
        try {
            cm.registerDefaultNetworkCallback(cb)
            netCallback = cb
        } catch (e: Exception) {
            // without it, the retries and the alarm still send
        }
    }

    private fun unwatchNetwork() {
        netCallback?.let {
            try { (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(it) } catch (e: Exception) { /* gone */ }
        }
        netCallback = null
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
            }) { b ->
                // a batch's answer carries the relay's last request for Direct, which a push may not have brought
                if (PaceState.offer(c, b)) main.post { settlePace() }
            }
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
        cancelWake()
        main.removeCallbacks(capCheck)
        val s = RunState.get(this)
        if (s.state == RunState.RUNNING) RunState.setState(this, RunState.ENDING)
        if (RunState.get(this).dests.isEmpty()) {
            finishRun()
            return
        }
        // the last batches go at once, the processor awake until they are sent, whatever the pace was
        holdWakeLock()
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
        cancelWake()
        unwatchNetwork()
        main.removeCallbacks(capCheck)
        uploader?.quit()
        uploader = null
        relay?.quit()
        relay = null
        alertWatch = null
        releaseWakeLock()
        releaseSendLock()
        lastSendKick = 0
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
        startGps(true)
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

    /** [live]: one fix a second; else a long run's fixes, delivered together. */
    private fun startGps(live: Boolean) {
        if (gpsOn) return
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        val t = HandlerThread("ozimut-gps").apply { start() }
        gpsThread = t
        gpsOn = true
        gpsLive = live
        if (live) {
            if (!platform(t, 1000L, 0L)) stopGps()
            return
        }
        val ch = PaceState.choice(this)
        val fixMs = ch.fix * 1000L
        // delivered when the batch is due, which their delivery then starts (sendIfDue)
        val delayMs = ch.send * 1000L
        val src = FixSources.long?.invoke()
        if (src != null) {
            batched = src
            val ok = try {
                src.start(this, fixMs, delayMs, t.looper, { list -> onFixes(list) }) {
                    // Play services refused: the platform's location instead
                    main.post {
                        if (batched === src && gpsOn && !gpsLive) {
                            try { src.stop() } catch (e: Exception) { /* off */ }
                            batched = null
                            val th = gpsThread
                            if (th == null || !platform(th, fixMs, delayMs)) stopGps()
                        }
                    }
                }
            } catch (e: Exception) {
                false
            }
            if (ok) return
            batched = null
        }
        if (!platform(t, fixMs, delayMs)) stopGps()
    }

    /** The platform's GPS: one fix every [fixMs]; [delayMs] > 0 lets it deliver them together (Android 12 and later). */
    private fun platform(t: HandlerThread, fixMs: Long, delayMs: Long): Boolean {
        val lm = getSystemService(LOCATION_SERVICE) as? LocationManager ?: return false
        return try {
            if (delayMs > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val req = LocationRequest.Builder(fixMs)
                    .setMinUpdateIntervalMillis(fixMs)
                    .setMaxUpdateDelayMillis(delayMs)
                    .setQuality(LocationRequest.QUALITY_HIGH_ACCURACY)
                    .build()
                val h = Handler(t.looper)
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, req, Executor { r -> h.post(r) }, this)
            } else {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, fixMs, 0f, this, t.looper)
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun stopGps() {
        if (!gpsOn) return
        batched?.let { try { it.stop() } catch (e: Exception) { /* already off */ } }
        batched = null
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

    /** A long run's sending: the processor kept awake 90 s at most (an HTTP attempt takes 45 s at most). */
    private fun holdSendLock() {
        val l = sendLock ?: (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ozimut:send").apply { setReferenceCounted(false) }
        sendLock = l
        try { l.acquire(90_000L) } catch (e: Exception) { /* none */ }
    }

    private fun releaseSendLock() {
        try { sendLock?.let { if (it.isHeld) it.release() } } catch (e: Exception) { /* released */ }
        sendLock = null
    }

    /** Fixes delivered together (a long run): each recorded, then the clock and the sending if a batch is due. */
    private fun onFixes(list: List<Location>) {
        for (l in list) record(l)
        afterFixes()
    }

    override fun onLocationChanged(locations: MutableList<Location>) {
        for (l in locations) record(l)
        afterFixes()
    }

    override fun onLocationChanged(loc: Location) {
        record(loc)
        afterFixes()
    }

    /** A long run's fixes woke the phone: the clock, and the batch if it is due. */
    private fun afterFixes() {
        if (gpsLive) return
        main.post { if (mode == "run" && !gpsLive && tick()) sendIfDue() }
    }

    private fun record(loc: Location) {
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
        unwatchNetwork()
        main.removeCallbacksAndMessages(null)
        uploader?.quit()
        uploader = null
        relay?.quit()
        relay = null
        releaseWakeLock()
        releaseSendLock()
        running = false
        testing = false
        super.onDestroy()
    }
}
