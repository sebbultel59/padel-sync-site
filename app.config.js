export default {
  expo: {
    name: "Padel Sync",
    slug: "padel-sync",
    entryPoint: "./index.js",
    scheme: "padelsync",
    version: "1.3.4",
    icon: "./assets/icon.png", // chemin par défaut pour éviter les erreurs build iOS
    ios: {
      bundleIdentifier: "app.syncpadel.mobile",
      supportsTablet: false,
      buildNumber: "18",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
        NSLocationWhenInUseUsageDescription:
          "Nous utilisons votre position pour trouver les clubs de padel proches.",
        NSLocationAlwaysUsageDescription:
          "Nous utilisons votre position pour trouver les clubs de padel proches.",
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription: "Permet de scanner ou ajouter des photos de profil ou de club.",
        NSPhotoLibraryAddUsageDescription: "Permet d’enregistrer des images liées aux matchs.",
        NSCalendarsUsageDescription: "Permet d’ajouter des matchs à votre calendrier."
      }
    },
    android: {
      package: "com.padelsync.app",
      versionCode: 18,
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
      ["expo-build-properties", { ios: { deploymentTarget: "15.1" } }],
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
    extra: {
      eas: {
        projectId: "527d2473-fc9c-4070-a4d7-dfe710a64830"
      }
    }
  }
};