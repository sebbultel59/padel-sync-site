#!/bin/bash
echo "🧹 Nettoyage du cache Android..."
cd android
./gradlew clean
cd ..
echo "✅ Cache nettoyé. Vous pouvez maintenant rebuild avec: npx expo run:android"
