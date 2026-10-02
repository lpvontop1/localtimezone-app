# Minimal rules (minify disabled). Keep JS bridge intact if enabled later.
-keepclassmembers class com.lpvontop.localtime.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
