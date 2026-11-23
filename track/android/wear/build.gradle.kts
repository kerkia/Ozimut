import org.jetbrains.kotlin.gradle.dsl.JvmTarget

/*
 * The Wear OS app (owner, 2026-11-23): a watch with its own mobile connection (LTE, eSIM) records and sends alone, as the
 * phone app does. The recording and the sending are the phone app's own files, compiled here as they are (SHARED below):
 * one tracker, never forked. Only the screen, the notifications and the pairing by a claim code are the watch's.
 */
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val debugBase = (project.findProperty("ozimutBase") as String?) ?: "https://ozimut.com"
val keystorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() && file(it).exists() }

/** The phone app's files the watch compiles as they are: the queue, the batches, the pairing's storage, the sending, the service. */
val SHARED = listOf("Batch.kt", "FixDb.kt", "Device.kt", "Http.kt", "Uploader.kt", "Tracker.kt", "Phone.kt", "TrackerService.kt")

abstract class SharedSources : DefaultTask() {
    @get:InputFiles abstract val sources: ConfigurableFileCollection
    @get:OutputDirectory abstract val out: DirectoryProperty

    @TaskAction
    fun copy() {
        val dir = out.get().asFile
        dir.deleteRecursively()
        val pkg = dir.resolve("com/ozimut/app").apply { mkdirs() }
        sources.forEach { it.copyTo(pkg.resolve(it.name), overwrite = true) }
    }
}

val sharedSources = tasks.register<SharedSources>("sharedSources") {
    sources.from(SHARED.map { file("../app/src/main/java/com/ozimut/app/$it") })
    out.set(layout.buildDirectory.dir("generated/shared"))
}

android {
    namespace = "com.ozimut.app"
    compileSdk = 36

    defaultConfig {
        // the phone's id: Play lists the watch app with the phone app (Wear OS asks for the same package name)
        applicationId = "com.ozimut.app"
        minSdk = 30
        targetSdk = 36
        // a watch build's numbers never meet the phone's (Play wants each APK's own)
        versionCode = 300_000_000 + ((project.findProperty("versionCode") as String?)?.toInt() ?: 1)
        versionName = "1.0.0"
        buildConfigField("String", "BASE_URL", "\"https://ozimut.com\"")
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
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
        }
    }

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

// the copies compiled as the module's own sources, made before anything of the build runs
android.sourceSets.getByName("main").java.srcDir(layout.buildDirectory.dir("generated/shared"))
tasks.named("preBuild") { dependsOn(sharedSources) }

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")

    testImplementation("junit:junit:4.13.2")
}
