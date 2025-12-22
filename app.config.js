export default {
  expo: {
    name: "Padel Sync",
    slug: "padel-sync",
    entryPoint: "./index.js",
    scheme: "syncpadel",
    version: "3.1.0",
    newArchEnabled: true,
    icon: "./assets/icon.png", // chemin par défaut pour éviter les erreurs build iOS
    ios: {
      bundleIdentifier: "app.syncpadel.mobile",
      supportsTablet: false,
      buildNumber: "43",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
        NSLocationWhenInUseUsageDescription:
          "Nous utilisons votre position pour trouver les clubs de padel proches.",
        NSLocationAlwaysUsageDescription:
          "Nous utilisons votre position pour trouver les clubs de padel proches.",
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription: "Permet de scanner ou ajouter des photos de profil ou de club.",
        NSPhotoLibraryAddUsageDescription: "Permet d'enregistrer des images liées aux matchs.",
        NSCalendarsUsageDescription: "Permet d'ajouter des matchs à votre calendrier."
      }
    },
    android: {
      package: "com.padelsync.app",
      versionCode: 43,
      newArchEnabled: true,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png", // chemin corrigé
        backgroundColor: "#001831"
      },
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "POST_NOTIFICATIONS"
      ]
    },
    plugins: [
      [
        "expo-build-properties",
        {
          ios: { deploymentTarget: "15.1" },
          android: {
            kotlinVersion: "2.1.20",
            gradleProperties: {
              "org.gradle.jvmargs":
                "-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError",
              "ksp.version": "2.1.20-1.0.31"
            }
          }
        }
      ],
      "expo-router",
      "expo-secure-store",
      [
        "expo-notifications",
        {
          "icon": "./assets/icons/app-icon.png",
          "color": "#156bc9"
        }
      ]
    ],
    // Exclure expo-dev-client de l'autolinking pour éviter les erreurs de build Android
    _internal: {
      isDebuggingRemotely: false
    },
    extra: {
      eas: {
        projectId: "527d2473-fc9c-4070-a4d7-dfe710a64830"
      }
    }
  }
};