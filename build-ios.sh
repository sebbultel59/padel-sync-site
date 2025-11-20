#!/bin/bash

# Script pour construire l'application iOS en contournant le problème du SDK iOS 26.1

echo "🔧 Construction de l'application iOS..."
echo ""

# Ouvrir le projet dans Xcode
echo "📱 Ouverture du projet dans Xcode..."
echo ""
echo "⚠️  Instructions :"
echo "1. Dans Xcode, allez dans Product > Scheme > Edit Scheme"
echo "2. Sélectionnez 'Run' dans le panneau de gauche"
echo "3. Dans l'onglet 'Info', changez 'Build Configuration' si nécessaire"
echo "4. Dans l'onglet 'Options', sélectionnez un simulateur iOS 18.6"
echo "5. Cliquez sur 'Close'"
echo "6. Appuyez sur ⌘R pour construire et lancer l'application"
echo ""
echo "Ou utilisez la commande :"
echo "   xcodebuild -workspace ios/PadelSync.xcworkspace -scheme PadelSync -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build"
echo ""

open ios/PadelSync.xcworkspace




