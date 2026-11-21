package com.ozimut.app

import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * The site ↔ app bridge (design.md « The site ↔ app bridge »): window.OzimutNative.call(id, name, argsJson),
 * answered by window.__ozApp.resolve(id, json) or .reject(id, message).
 */
class Bridge(private val act: MainActivity) {
    private val io = Executors.newSingleThreadExecutor()

    @JavascriptInterface
    fun call(id: String?, name: String?, argsJson: String?) {
        val args = try {
            JSONObject(argsJson ?: "{}")
        } catch (e: Exception) {
            JSONObject()
        }
        val rid = id ?: ""
        act.runOnUiThread {
            // Only our own pages may call (an iframe of another site sees the interface too).
            if (!act.onOurPage()) {
                reject(rid, "forbidden")
                return@runOnUiThread
            }
            try {
                dispatch(rid, name ?: "", args)
            } catch (e: Exception) {
                reject(rid, e.message ?: "error")
            }
        }
    }

    /** A file the page made (a blob: or data: address): saved in Downloads. */
    @JavascriptInterface
    fun saveFile(name: String?, mime: String?, base64: String?) {
        if (base64 == null) return
        io.execute { Files.saveBase64(act, name ?: "", mime ?: "", base64) }
    }

    private fun dispatch(id: String, name: String, args: JSONObject) {
        when (name) {
            "info" -> resolve(id, info())
            "pair" -> {
                val code = Pairing.normalise(args.optString("code", ""))
                if (code == null) { reject(id, "code"); return }
                if (RunState.get(act).active) { reject(id, "running"); return }
                io.execute {
                    val r = Pairing.pair(act.applicationContext, code)
                    act.runOnUiThread {
                        if (r.ok) {
                            resolve(id, Device.pairedJson(act))
                            act.afterBridgePair(r)
                        } else {
                            reject(id, r.error ?: "network")
                        }
                    }
                }
            }
            "unpair" -> {
                if (RunState.get(act).active) { reject(id, "running"); return }
                Device.forget(act)
                FixDb.get(act).dropAllBut(null)
                RunState.clear(act)
                resolve(id, true)
                act.emitTracker()
            }
            "openTracker" -> {
                act.startActivity(Intent(act, TrackerActivity::class.java))
                resolve(id, true)
            }
            "trackerState" -> resolve(id, Tracker.stateJson(act))
            "selfTest" -> {
                act.startActivity(Intent(act, SelfTestActivity::class.java))
                resolve(id, true)
            }
            "pushRegister" -> act.pushRegister { resolve(id, it) }
            // TODO Health Connect: read the exercise routes (ExerciseSessionRecord with ExerciseRoute) once the
            // app asks for READ_EXERCISE and READ_EXERCISE_ROUTES; until then Android has no routes to offer.
            "healthRoutes" -> resolve(id, JSONArray())
            "healthRoute" -> reject(id, "unsupported")
            "openSettings" -> resolve(id, Phone.openSettings(act, args.optString("which", "app")))
            else -> reject(id, "unknown")
        }
    }

    private fun info(): JSONObject {
        val features = JSONArray().put("tracker").put("files")
        if (PushSupport.AVAILABLE) features.put("push")
        return JSONObject()
            .put("platform", "android")
            .put("version", BuildConfig.VERSION_NAME)
            .put("features", features)
            .put("paired", Device.pairedJson(act))
    }

    fun resolve(id: String, value: Any?) {
        act.js("window.__ozApp&&window.__ozApp.resolve(${idLiteral(id)},${toJson(value)})")
    }

    fun reject(id: String, message: String) {
        act.js("window.__ozApp&&window.__ozApp.reject(${idLiteral(id)},${JSONObject.quote(message)})")
    }

    companion object {
        /** The page's id as it gave it: a number stays a number. */
        fun idLiteral(id: String): String = if (Regex("^-?\\d{1,15}$").matches(id)) id else JSONObject.quote(id)

        fun toJson(v: Any?): String = when (v) {
            null, JSONObject.NULL -> "null"
            is JSONObject, is JSONArray -> v.toString()
            is Boolean, is Int, is Long -> v.toString()
            is Number -> JSONObject.numberToString(v)
            is String -> JSONObject.quote(v)
            is Uri -> JSONObject.quote(v.toString())
            else -> JSONObject.quote(v.toString())
        }
    }
}
