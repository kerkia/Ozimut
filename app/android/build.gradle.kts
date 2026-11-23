plugins {
    id("com.android.application") version "8.11.1" apply false
    id("org.jetbrains.kotlin.android") version "2.2.0" apply false
    // Applied by the app module only when app/google-services.json exists (push through FCM).
    id("com.google.gms.google-services") version "4.4.2" apply false
}
