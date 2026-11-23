package com.ozimut.app

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The watch's runs reach the phone (docs/track/ozitrac.md « The watch »): each finished run's file becomes a data item of
 * the Wear OS Data Layer, `/ozitrac/run/<run>` with the file as an asset. The system keeps it on the watch and hands it to
 * the paired phone whenever the two are connected (Bluetooth, Wi-Fi or through the cloud); the phone's Ozitrac files it in
 * « Mes courses » (`WatchRuns` in the phone app) and deletes the item. Nothing goes through Ozimut or the relay.
 */
object RunSync {
    const val PREFIX = "/ozitrac/run/"
    const val ASSET = "csv"
    /** Items still waiting for a phone, at most: the oldest go first (a watch never meets its phone). */
    private const val MAX_WAITING = 20

    private val io = Executors.newSingleThreadExecutor()
    private val busy = AtomicBoolean(false)

    private fun p(c: Context) = c.getSharedPreferences("runsync", Context.MODE_PRIVATE)

    /** Sends, on a background thread, every kept run the phone has not been given yet (none while a run is under way). */
    fun soon(c: Context) {
        val app = c.applicationContext
        if (RunState.get(app).active) return
        if (!busy.compareAndSet(false, true)) return
        io.execute {
            try {
                sendPending(app)
            } catch (e: Exception) {
                // no Google Play services on this watch, or the Data Layer refused: tried again at the next run's end
            } finally {
                busy.set(false)
            }
        }
    }

    private fun sendPending(c: Context) {
        val sent = p(c).getStringSet("sent", emptySet())?.toMutableSet() ?: mutableSetOf()
        val running = RunState.get(c).let { if (it.active) it.run else "" }
        val data = Wearable.getDataClient(c)
        for (f in RunLog.dir(c).listFiles { f -> f.name.endsWith(".csv") } ?: emptyArray()) {
            val run = f.name.removeSuffix(".csv")
            if (run == running || run in sent || f.length() == 0L) continue
            val req = PutDataMapRequest.create(PREFIX + run).apply {
                dataMap.putString("run", run)
                dataMap.putAsset(ASSET, Asset.createFromBytes(f.readBytes()))
                dataMap.putLong("at", System.currentTimeMillis())
            }.asPutDataRequest().setUrgent()
            Tasks.await(data.putDataItem(req), 30, TimeUnit.SECONDS)
            sent += run
            // the names of runs pruned from the watch are dropped from the list as it is saved
            val kept = (RunLog.dir(c).list() ?: emptyArray()).map { it.removeSuffix(".csv") }.toSet()
            p(c).edit().putStringSet("sent", sent.filter { it in kept }.toSet()).apply()
        }
        trim(c, data)
    }

    /** The items this watch put that no phone took yet: the oldest beyond [MAX_WAITING] deleted. */
    private fun trim(c: Context, data: DataClient) {
        val me = Tasks.await(Wearable.getNodeClient(c).localNode, 30, TimeUnit.SECONDS).id
        val items = Tasks.await(data.getDataItems(Uri.parse("wear://$me$PREFIX"), DataClient.FILTER_PREFIX), 30, TimeUnit.SECONDS)
        try {
            val mine = items.map { it.uri }.sortedBy { it.path }
            if (mine.size > MAX_WAITING) {
                // a run id begins with its UTC start (r_YYYYMMDDTHHMMSS_xxxx): sorted by path is sorted by time
                for (u in mine.take(mine.size - MAX_WAITING)) Tasks.await(data.deleteDataItems(u), 30, TimeUnit.SECONDS)
            }
        } finally {
            items.release()
        }
    }
}
