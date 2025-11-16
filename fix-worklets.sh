#!/bin/bash

echo "🔧 Correction du mismatch Worklets..."
echo ""

# 1. Nettoyer le cache Metro
echo "📦 Nettoyage du cache Metro..."
rm -rf node_modules/.cache
rm -rf .expo
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-*

# 2. Nettoyer le cache npm
echo "📦 Nettoyage du cache npm..."
npm cache clean --force

# 3. Réinstaller les dépendances
echo "📦 Réinstallation des dépendances..."
rm -rf node_modules
npm install

# 4. Pour Android : nettoyer le build
if [ -d "android" ]; then
  echo "🤖 Nettoyage du build Android..."
  cd android
  ./gradlew clean
  cd ..
fi

# 5. Pour iOS : nettoyer les pods
if [ -d "ios" ]; then
  echo "🍎 Nettoyage des pods iOS..."
  cd ios
  rm -rf Pods
  rm -rf Podfile.lock
  pod install
  cd ..
fi

echo ""
echo "✅ Nettoyage terminé !"
echo ""
echo "📱 Pour reconstruire l'application :"
echo "   - Android : npx expo run:android"
echo "   - iOS     : npx expo run:ios"
echo ""
echo "⚠️  Important : Vous devez reconstruire l'application native"
echo "   (pas juste relancer Expo Go) pour que les changements prennent effet."

