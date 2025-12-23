# ✅ Checklist de Build iOS et Android

## 📱 Configuration iOS

### Info.plist
- ✅ **Bundle Identifier** : `app.syncpadel.mobile`
- ✅ **Version** : 3.0.4
- ✅ **Build Number** : 37
- ✅ **Permissions** :
  - ✅ Localisation (WhenInUse, Always)
  - ✅ Caméra
  - ✅ Bibliothèque photo (lecture et écriture)
  - ✅ Calendrier
  - ✅ Face ID
  - ✅ Microphone (pour compatibilité future)
- ✅ **Background Modes** : remote-notification
- ✅ **URL Schemes** : syncpadel, app.syncpadel.mobile, exp+padel-sync
- ✅ **Encryption** : ITSAppUsesNonExemptEncryption = false
- ✅ **Deployment Target** : iOS 15.1

### Assets iOS
- ✅ **Icon** : `./assets/icon.png`
- ✅ **Splash Screen** : Configuré dans SplashScreen.storyboard

## 🤖 Configuration Android

### AndroidManifest.xml
- ✅ **Package** : `com.padelsync.app`
- ✅ **Version Code** : 37
- ✅ **Version Name** : 3.0.4
- ✅ **Permissions** :
  - ✅ ACCESS_FINE_LOCATION
  - ✅ ACCESS_COARSE_LOCATION
  - ✅ POST_NOTIFICATIONS
  - ✅ CAMERA
  - ✅ READ_EXTERNAL_STORAGE
  - ✅ WRITE_EXTERNAL_STORAGE
  - ✅ READ_MEDIA_IMAGES (Android 13+)
  - ✅ VIBRATE
  - ✅ INTERNET
- ✅ **Intent Filters** : syncpadel scheme configuré
- ✅ **Notification Icon** : Configuré

### Assets Android
- ✅ **Adaptive Icon** : `./assets/adaptive-icon.png`
- ✅ **Background Color** : #001831
- ✅ **Notification Icon** : Configuré dans drawable

## 🔧 Configuration EAS Build

### eas.json
- ✅ **Development** : Build avec dev client
- ✅ **Preview** : Build interne (APK pour Android, IPA pour iOS)
- ✅ **Production** : Build pour stores (App Bundle Android, IPA iOS)
- ✅ **Apple Team ID** : F2MNK9R7Q8
- ✅ **Service Account** : google-service-account.json requis pour Android

## 📋 Commandes de Build

### Build iOS
```bash
# Build de développement
eas build --platform ios --profile development

# Build de preview (TestFlight)
eas build --platform ios --profile preview

# Build de production (App Store)
eas build --platform ios --profile production
```

### Build Android
```bash
# Build de développement
eas build --platform android --profile development

# Build de preview (APK)
eas build --platform android --profile preview

# Build de production (App Bundle)
eas build --platform android --profile production
```

### Build les deux plateformes
```bash
eas build --platform all --profile production
```

## ⚠️ Points à vérifier avant le build

### Avant chaque build
1. ✅ Vérifier que `version` et `buildNumber`/`versionCode` sont à jour dans `app.config.js`
2. ✅ Vérifier que toutes les permissions sont justifiées dans Info.plist
3. ✅ Vérifier que les assets (icon, splash) existent
4. ✅ Vérifier que les credentials EAS sont configurés (`eas credentials`)
5. ✅ Pour iOS : Vérifier les certificats et profils de provisioning
6. ✅ Pour Android : Vérifier que `google-service-account.json` existe (pour production)

### Assets requis
- ✅ `./assets/icon.png` (1024x1024 pour iOS)
- ✅ `./assets/adaptive-icon.png` (1024x1024 pour Android)
- ✅ `./assets/icons/app-icon.png` (pour notifications)

### Fichiers de configuration
- ✅ `app.config.js` : Configuration principale
- ✅ `eas.json` : Configuration EAS Build
- ✅ `ios/PadelSync/Info.plist` : Configuration iOS native
- ✅ `android/app/src/main/AndroidManifest.xml` : Configuration Android native

## 🚀 Soumission aux stores

### App Store (iOS)
```bash
eas submit --platform ios --profile production
```

### Google Play (Android)
```bash
eas submit --platform android --profile production
```

## 📝 Notes importantes

1. **Version et Build Number** : Incrémenter le build number à chaque build, même si la version reste la même
2. **Permissions** : Toutes les descriptions de permissions doivent être en français et justifier l'utilisation
3. **Encryption** : L'app déclare ne pas utiliser d'encryption non-exempte (ITSAppUsesNonExemptEncryption = false)
4. **New Architecture** : Activée pour iOS et Android
5. **Deployment Target** : iOS 15.1 minimum

## 🔍 Vérifications post-build

1. Tester l'installation sur un appareil réel
2. Vérifier que toutes les permissions fonctionnent
3. Vérifier que les notifications push fonctionnent
4. Vérifier que les deep links fonctionnent
5. Vérifier que les assets (icônes, splash) s'affichent correctement





