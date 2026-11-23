import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Push through Firebase Cloud Messaging only when the owner has put google-services.json here
// (it is not in the repository). Without it the app builds without any Firebase code.
val hasFcm = file("google-services.json").exists()
if (hasFcm) apply(plugin = "com.google.gms.google-services")

// Release signing from the environment (the CI decodes the keystore secret into a file).
val keystorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() && file(it).exists() }

// A debug build may talk to another server: gradle assembleDebug -PozimutBase=https://staging.example
val debugBase = (project.findProperty("ozimutBase") as String?) ?: "https://ozimut.com"

android {
    namespace = "com.ozimut.app"
    compileSdk = 36

    defaultConfig {
        // Ozitrac (docs/track/ozitrac.md); the code's namespace stays com.ozimut.app
        applicationId = "com.ozimut.ozitrac"
        minSdk = 26
        targetSdk = 36
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = "1.0.0"
        buildConfigField("String", "BASE_URL", "\"https://ozimut.com\"")
        buildConfigField("boolean", "FCM", hasFcm.toString())
        manifestPlaceholders["fcmEnabled"] = hasFcm.toString()
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        getByName("debug") {
            buildConfigField("String", "BASE_URL", "\"$debugBase\"")
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    sourceSets.getByName("main").java.srcDir(if (hasFcm) "src/fcm/java" else "src/nofcm/java")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    // QR codes (Apache-2.0)
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    if (hasFcm) implementation("com.google.firebase:firebase-messaging:24.1.1")
    // the runs the Wear OS watch hands over (WatchRuns; Google Play services)
    implementation("com.google.android.gms:play-services-wearable:19.0.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
