# The web page calls these by name.
-keepclassmembers class com.ozimut.app.Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-dontwarn com.google.zxing.**
