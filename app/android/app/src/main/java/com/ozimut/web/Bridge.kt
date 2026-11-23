package com.ozimut.web

import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject

/**
 * The site ↔ app bridge (docs/app/design.md « The bridge »): window.OzimutNative.call(id, name, argsJson), answered by
 * window.__ozApp.resolve(id, json) or .reject(id, message). The shell holds no credential and calls no server: the page
 * posts what `pushRegister` answers with its own session.
 */
class Bridge(private val act: MainActivity) {

    @JavascriptInterface
    fun call(id: String?, name: String?, argsJson: String?) {
        val args = try {
            JSONObject(argsJson ?: "{}")
        } catch (e: Exception) {
            JSONObject()
        }
        val rid = id ?: ""
        act.runOnUiThread {
            // Only the site's own page may call (the interface is also seen by a frame of another host).
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

    private fun dispatch(id: String, name: String, args: JSONObject) {
        when (name) {
            "info" -> {
                resolve(id, info())
                act.pageIsReady()          // the page listens now: the files and the notification that waited go to it
            }
            "pushState" -> resolve(id, JSONObject().put("state", act.pushState()))
            "pushRegister" -> act.pushRegister { resolve(id, it) }
            // (not in the contract's table: lets the page forget this phone's token when its notifications are turned off)
            "pushOff" -> {
                act.pushOff()
                resolve(id, JSONObject().put("ok", true))
            }
            "saveFile" -> act.saveFile(args.optString("name", ""), args.optString("mime", ""), args.optString("data", "")) {
                resolve(id, JSONObject().put("ok", it))
            }
            "scanMap" -> act.scanMap { resolve(id, it) }
            "openSettings" -> resolve(id, act.openAppSettings())
            else -> reject(id, "unknown")
        }
    }

    private fun info(): JSONObject {
        val features = JSONArray().put("files").put("save")
        if (PushSupport.AVAILABLE) features.put("push")
        if (act.scanAvailable()) features.put("scan")
        return JSONObject()
            .put("platform", "android")
            .put("version", BuildConfig.VERSION_NAME)
            .put("features", features)
    }

    fun resolve(id: String, value: Any?) {
        act.js("window.__ozApp&&window.__ozApp.resolve(${idLiteral(id)},${toJson(value)})")
    }

    fun reject(id: String, message: String) {
        act.js("window.__ozApp&&window.__ozApp.reject(${idLiteral(id)},${JSONObject.quote(message)})")
    }

    companion object {
        /** The page's id as a JavaScript literal. */
        fun idLiteral(id: String): String = JSONObject.quote(id)

        fun toJson(v: Any?): String = when (v) {
            null, JSONObject.NULL -> "null"
            is JSONObject, is JSONArray -> v.toString()
            is Boolean, is Int, is Long -> v.toString()
            is Number -> JSONObject.numberToString(v)
            is String -> JSONObject.quote(v)
            else -> JSONObject.quote(v.toString())
        }
    }
}
