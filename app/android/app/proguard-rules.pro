# The page calls the bridge by name (window.OzimutNative.call): its methods keep theirs.
-keepclassmembers class com.ozimut.web.Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
