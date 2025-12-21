# Guide de préparation pour un nouveau build

Ce guide vous aide à préparer votre projet pour un nouveau build iOS et Android.

## Configuration actuelle

- **Version**: 3.0.4
- **iOS Build Number**: 37
- **Android Version Code**: 37
- **Bundle ID iOS**: app.syncpadel.mobile
- **Package Android**: com.padelsync.app

## Méthode rapide (recommandée)

Utilisez le script automatique :

```bash
./prepare-build.sh [version] [build_number]
```

Exemples :
```bash
# Incrémenter automatiquement le build number
./prepare-build.sh 3.0.5

# Spécifier version et build number
./prepare-build.sh 3.0.5 38
```

Le script va :
1. ✅ Mettre à jour `package.json`
2. ✅ Mettre à jour `app.config.js`
3. ✅ Mettre à jour `ios/PadelSync/Info.plist`
4. ✅ Vérifier `android/app/build.gradle` si nécessaire

## Méthode manuelle

### 1. Mettre à jour la version

**package.json** :
```json
"version": "3.0.5"
```

**app.config.js** :
```javascript
version: "3.0.5",
ios: {
  buildNumber: "38",
},
android: {
  versionCode: 38,
}
```

### 2. Mettre à jour Info.plist

**ios/PadelSync/Info.plist** :
```xml
<key>CFBundleShortVersionString</key>
<string>3.0.5</string>
<key>CFBundleVersion</key>
<string>38</string>
```

### 3. Vérifier AndroidManifest.xml

Le `AndroidManifest.xml` est généralement généré automatiquement par Expo, mais vérifiez qu'il contient bien les bonnes permissions.

## Vérifications avant le build

### ✅ Checklist iOS

- [ ] Version et build number cohérents dans tous les fichiers
- [ ] Bundle identifier correct : `app.syncpadel.mobile`
- [ ] Permissions configurées dans `app.config.js` → `ios.infoPlist`
- [ ] Certificats et profils de provisioning à jour
- [ ] Apple Team ID correct : `F2MNK9R7Q8`

### ✅ Checklist Android

- [ ] Version et version code cohérents
- [ ] Package name correct : `com.padelsync.app`
- [ ] Permissions configurées dans `app.config.js` → `android.permissions`
- [ ] Keystore valide et accessible
- [ ] Google Play Console configurée

### ✅ Checklist générale

- [ ] Tous les assets présents (icônes, splash screens)
- [ ] Variables d'environnement configurées
- [ ] Tests locaux réussis
- [ ] Changelog préparé
- [ ] Screenshots à jour pour les stores

## Commandes de build

### Build iOS

```bash
# Build de production
npx eas build --platform ios --profile production

# Build pour TestFlight
npx eas build --platform ios --profile preview
```

### Build Android

```bash
# Build de production (AAB pour Google Play)
npx eas build --platform android --profile production

# Build APK pour test
npx eas build --platform android --profile preview
```

### Build les deux plateformes

```bash
npx eas build --platform all --profile production
```

## Soumission aux stores

### iOS (App Store Connect)

```bash
# Soumission automatique
npx eas submit --platform ios --latest

# Ou manuellement via Transporter/Xcode
```

### Android (Google Play Console)

```bash
# Soumission automatique
npx eas submit --platform android --latest

# Ou manuellement via Google Play Console
```

## Numérotation des versions

### Version (Semantic Versioning)

Format : `MAJOR.MINOR.PATCH`

- **MAJOR** : Changements incompatibles (ex: 3.0.0 → 4.0.0)
- **MINOR** : Nouvelles fonctionnalités compatibles (ex: 3.0.4 → 3.1.0)
- **PATCH** : Corrections de bugs (ex: 3.0.4 → 3.0.5)

### Build Number / Version Code

- **iOS** : Numéro de build (incrémente à chaque build)
- **Android** : Version code (doit être supérieur au précédent)

⚠️ **Important** : Le build number/version code doit toujours augmenter, même si la version reste la même.

## Dépannage

### Erreur "Version already exists"

- Incrémentez le build number/version code
- Vérifiez que la version n'existe pas déjà dans les stores

### Erreur "Bundle identifier mismatch"

- Vérifiez `app.config.js` → `ios.bundleIdentifier`
- Vérifiez `app.config.js` → `android.package`
- Vérifiez que les identifiants correspondent dans les stores

### Erreur de certificat iOS

```bash
# Vérifier les credentials
npx eas credentials

# Réinitialiser les credentials iOS
npx eas credentials --platform ios
```

### Erreur de keystore Android

```bash
# Vérifier les credentials Android
npx eas credentials --platform android

# Générer un nouveau keystore si nécessaire
npx eas credentials --platform android
```

## Ressources

- [Documentation EAS Build](https://docs.expo.dev/build/introduction/)
- [Documentation EAS Submit](https://docs.expo.dev/submit/introduction/)
- [App Store Connect](https://appstoreconnect.apple.com)
- [Google Play Console](https://play.google.com/console)

## Support

En cas de problème :
1. Consultez les logs sur [expo.dev](https://expo.dev)
2. Vérifiez la [documentation Expo](https://docs.expo.dev)
3. Contactez le support Expo via le dashboard

