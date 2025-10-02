export default {
  expo: {
    name: "Padel Sync",
    slug: "padel-sync",
    entryPoint: "./index.js",
    scheme: "padelsync",
    ios: {
      bundleIdentifier: "app.padelsync.mobile",
      supportsTablet: false,
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "Nous utilisons votre position pour trouver les clubs de padel proches.",
        ITSAppUsesNonExemptEncryption: false
      },
      entitlements: {
        "com.apple.developer.associated-domains": [
          "applinks:padelsync.app"
        ]
      }
    },
    android: {
      package: "com.padelsync.app",
      permissions: ["ACCESS_FINE_LOCATION"]
    },
    plugins: [
      ["expo-build-properties", { ios: { deploymentTarget: "15.1" } }],
      "expo-router",
      "expo-secure-store",
      "expo-notifications"
    ],
    extra: {
      eas: {
        projectId: "527d2473-fc9c-4070-a4d7-dfe710a64830"
      }
    }
  }
};