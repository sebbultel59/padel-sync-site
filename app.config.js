export default {
    expo: {
      name: "Padel Sync",
      slug: "padel-sync",
      scheme: "padelsync",
      ios: {
        bundleIdentifier: "com.padelsync.app",
        infoPlist: {
          NSLocationWhenInUseUsageDescription: "Nous utilisons votre position pour trouver les clubs de padel proches."
        },
        entitlements: {
          "com.apple.developer.associated-domains": [
            "applinks:padelsync.app"
          ]
        },
      },
      android: {
        package: "com.padelsync.app",
        permissions: ["ACCESS_FINE_LOCATION"]
      },
      plugins: [
        ["expo-build-properties", { ios: { deploymentTarget: "15.1" } }],
        "expo-router",
        "expo-secure-store",
        "expo-notifications" // 👈 ajouté pour notifications
      ],
      extra: {
        eas: {
          projectId: "527d2473-fc9c-4070-a4d7-dfe710a64830"
        }
      }
    }
  };