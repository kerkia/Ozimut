import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Native notifications through Firebase Cloud Messaging only when google-services.json is here (it is not in the
// repository: the owner's, or the CI's secret). Without it the app builds without any Firebase code.
val hasFcm = file("google-services.json").exists()
if (hasFcm) apply(plugin = "com.google.gms.google-services")

// Release signing from the environment (the CI decodes the keystore secret into a file).
val keystorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() && file(it).exists() }

// A debug build may show another server: gradle assembleDebug -PozimutBase=https://staging.example
val debugBase = ((project.findProperty("ozimutBase") as String?) ?: "https://ozimut.com").trimEnd('/')

android {
    namespace = "com.ozimut.web"
    compileSdk = 36

    defaultConfig {
        // The Ozimut companion app (docs/app/design.md); Folloz is com.ozimut.folloz (github.com/kerkia/Folloz)
        applicationId = "com.ozimut.app"
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
    // The document scanner of Google Play services (its model is fetched by Play services, not bundled in the app)
    implementation("com.google.android.gms:play-services-mlkit-document-scanner:16.0.0-beta1")
    implementation("com.google.android.gms:play-services-base:18.5.0")
    if (hasFcm) implementation("com.google.firebase:firebase-messaging:24.1.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
