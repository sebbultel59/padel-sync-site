# Mise à jour de l'ID App Store

## ⚠️ Action requise

Les liens vers l'App Store utilisent actuellement un ID placeholder : `id6739000000`

Vous devez remplacer cet ID par le **vrai ID de votre app** sur l'App Store.

## 🔍 Comment trouver l'ID de votre app

### Option 1 : Via App Store Connect

1. Allez sur [App Store Connect](https://appstoreconnect.apple.com)
2. Sélectionnez votre app "Padel Sync"
3. L'ID de l'app se trouve dans l'URL ou dans les informations de l'app
4. Format : `id1234567890` (un nombre)

### Option 2 : Via l'URL de l'app

Si votre app est déjà publiée, l'ID se trouve dans l'URL :
```
https://apps.apple.com/app/id1234567890
                                    ^^^^^^^^^^^^
                                    C'est l'ID
```

### Option 3 : Via TestFlight

Si l'app est en TestFlight, utilisez l'ID de TestFlight ou créez un lien de partage TestFlight.

## 📝 Fichiers à modifier

Une fois que vous avez l'ID réel, remplacez `id6739000000` par votre ID dans :

1. `public/index.html` (2 occurrences)
2. `public/reset-password.html` (1 occurrence)

### Exemple

Si votre ID est `id1234567890`, remplacez :
```javascript
appStoreLink = 'https://apps.apple.com/app/id6739000000';
```

Par :
```javascript
appStoreLink = 'https://apps.apple.com/app/id1234567890';
```

## 🚀 Après la mise à jour

1. Poussez les changements sur Git
2. Vercel redéploiera automatiquement
3. Les liens fonctionneront correctement

## 📱 Lien Google Play

Le lien Google Play utilise déjà le bon package ID : `com.padelsync.app`

Si votre app a un ID différent sur Google Play, modifiez-le aussi dans les mêmes fichiers.

