package com.ozimut.web

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class BridgeTest {
    @Test
    fun valuesAsJavaScriptLiterals() {
        assertEquals("null", Bridge.toJson(null))
        assertEquals("null", Bridge.toJson(JSONObject.NULL))
        assertEquals("true", Bridge.toJson(true))
        assertEquals("12", Bridge.toJson(12))
        assertEquals("\"a\\\"b\"", Bridge.toJson("a\"b"))
        assertEquals("{\"ok\":true}", Bridge.toJson(JSONObject().put("ok", true)))
        assertEquals("[\"files\",\"save\"]", Bridge.toJson(JSONArray().put("files").put("save")))
    }

    @Test
    fun theCallIdIsAlwaysAString() {
        assertEquals("\"c12\"", Bridge.idLiteral("c12"))
        assertEquals("\"1\"", Bridge.idLiteral("1"))
        assertEquals("\"x\\\");alert(1)//\"", Bridge.idLiteral("x\");alert(1)//"))
    }
}
