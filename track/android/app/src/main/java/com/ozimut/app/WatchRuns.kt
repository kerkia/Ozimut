package com.ozimut.app

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import java.util.concurrent.TimeUnit

/**
 * The runs the Wear OS watch hands over (docs/track/ozitrac.md « The watch »; the watch's side is `RunSync`): each data item
 * `/ozitrac/run/<run>` holds a run's file as an asset. The system wakes this service when one arrives, whenever the phone
 * and the watch are connected; the run is kept in « Mes courses » as the phone's own and the item is deleted, on the watch
 * too. « Mes courses » also collects any item a missed wake-up left (`collect`).
 */
class WatchRuns : WearableListenerService() {
    companion object {
        private const val PREFIX = "/ozitrac/run/"
        private const val ASSET = "csv"

        /** Every item waiting, filed and deleted (a network thread). -> how many runs were filed */
        fun collect(c: Context): Int = try {
            val data = Wearable.getDataClient(c)
            val items = Tasks.await(data.getDataItems(Uri.parse("wear://*$PREFIX"), DataClient.FILTER_PREFIX), 20, TimeUnit.SECONDS)
            val list = try { items.map { it.freeze() } } finally { items.release() }
            list.count { take(c, it) }
        } catch (e: Exception) {
            0                                   // no Google Play services, or no watch ever paired
        }

        private fun take(c: Context, item: DataItem): Boolean {
            if (item.uri.path?.startsWith(PREFIX) != true) return false
            val map = DataMapItem.fromDataItem(item).dataMap
            val run = map.getString("run") ?: item.uri.path!!.removePrefix(PREFIX)
            val asset = map.getAsset(ASSET) ?: return false
            val data = Wearable.getDataClient(c)
            val bytes = Tasks.await(data.getFdForAsset(asset), 60, TimeUnit.SECONDS).inputStream.use { it.readBytes() }
            if (!RunLog.importWatch(c, run, bytes)) return false
            Tasks.await(data.deleteDataItems(item.uri), 20, TimeUnit.SECONDS)
            return true
        }
    }

    override fun onDataChanged(events: DataEventBuffer) {
        // the buffer is released when this returns: its items are frozen first; the service's own thread may wait
        val items = events.filter { it.type == DataEvent.TYPE_CHANGED }.map { it.dataItem.freeze() }
        for (item in items) {
            try {
                take(this, item)
            } catch (e: Exception) {
                // left in place: « Mes courses » collects it later
            }
        }
    }
}
