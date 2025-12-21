# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep React Native classes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Keep Expo modules
-keep class expo.modules.** { *; }
-keep class org.unimodules.** { *; }

# Suppress warnings about deprecated APIs used in third-party libraries
# These APIs are deprecated in Android 15 but are still used by React Native, Expo, and Material Design
# Our application code uses the new WindowInsetsController API (see MainActivity.kt)
# This is a known issue that will be resolved when dependencies are updated
-dontwarn android.view.Window$getStatusBarColor
-dontwarn android.view.Window$getNavigationBarColor
-dontwarn android.view.Window$setStatusBarColor
-dontwarn android.view.Window$setNavigationBarColor
-dontwarn android.view.WindowInsets$Type$statusBars
-dontwarn android.view.WindowInsets$Type$navigationBars

# Suppress warnings about deprecated layout cutout modes
-dontwarn android.view.WindowManager$LayoutParams$LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
-dontwarn android.view.WindowManager$LayoutParams$LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep Serializable classes
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Keep annotations
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Keep line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
