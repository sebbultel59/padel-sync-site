#!/bin/bash

# Script pour préparer le projet pour un nouveau build iOS et Android
# Usage: ./prepare-build.sh [version] [build_number]
# Exemple: ./prepare-build.sh 3.0.5 38

set -e

# Couleurs pour les messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Préparation du projet pour un nouveau build${NC}\n"

# Lire les valeurs actuelles
CURRENT_VERSION=$(grep -A 1 '"version"' package.json | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1)
CURRENT_IOS_BUILD=$(grep 'buildNumber' app.config.js | grep -o '[0-9]\+' | head -1)
CURRENT_ANDROID_VERSION_CODE=$(grep 'versionCode' app.config.js | grep -o '[0-9]\+' | head -1)

echo -e "${YELLOW}Configuration actuelle:${NC}"
echo "  Version: $CURRENT_VERSION"
echo "  iOS Build Number: $CURRENT_IOS_BUILD"
echo "  Android Version Code: $CURRENT_ANDROID_VERSION_CODE"
echo ""

# Demander les nouvelles valeurs si non fournies
if [ -z "$1" ]; then
    read -p "Nouvelle version (ex: 3.0.5) [laissez vide pour garder $CURRENT_VERSION]: " NEW_VERSION
    NEW_VERSION=${NEW_VERSION:-$CURRENT_VERSION}
else
    NEW_VERSION=$1
fi

if [ -z "$2" ]; then
    read -p "Nouveau build number (ex: 38) [laissez vide pour incrémenter automatiquement]: " NEW_BUILD
    if [ -z "$NEW_BUILD" ]; then
        NEW_BUILD=$((CURRENT_IOS_BUILD + 1))
    fi
else
    NEW_BUILD=$2
fi

echo ""
echo -e "${GREEN}Nouvelle configuration:${NC}"
echo "  Version: $NEW_VERSION"
echo "  iOS Build Number: $NEW_BUILD"
echo "  Android Version Code: $NEW_BUILD"
echo ""

read -p "Confirmer ces valeurs? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo -e "${RED}❌ Annulé${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}📝 Mise à jour des fichiers...${NC}"

# 1. Mettre à jour package.json
echo "  → package.json"
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json

# 2. Mettre à jour app.config.js
echo "  → app.config.js"
sed -i '' "s/version: \"$CURRENT_VERSION\"/version: \"$NEW_VERSION\"/" app.config.js
sed -i '' "s/buildNumber: \"$CURRENT_IOS_BUILD\"/buildNumber: \"$NEW_BUILD\"/" app.config.js
sed -i '' "s/versionCode: $CURRENT_ANDROID_VERSION_CODE/versionCode: $NEW_BUILD/" app.config.js

# 3. Mettre à jour Info.plist
echo "  → ios/PadelSync/Info.plist"
sed -i '' "s/<string>$CURRENT_VERSION<\/string>/<string>$NEW_VERSION<\/string>/" ios/PadelSync/Info.plist
sed -i '' "s/<string>$CURRENT_IOS_BUILD<\/string>/<string>$NEW_BUILD<\/string>/" ios/PadelSync/Info.plist

# 4. Vérifier build.gradle Android (si existe)
if [ -f "android/app/build.gradle" ]; then
    echo "  → android/app/build.gradle"
    # Note: versionName et versionCode sont généralement gérés par Expo, mais on vérifie
    if grep -q "versionName" android/app/build.gradle; then
        sed -i '' "s/versionName \"$CURRENT_VERSION\"/versionName \"$NEW_VERSION\"/" android/app/build.gradle
    fi
    if grep -q "versionCode" android/app/build.gradle; then
        sed -i '' "s/versionCode $CURRENT_ANDROID_VERSION_CODE/versionCode $NEW_BUILD/" android/app/build.gradle
    fi
fi

echo ""
echo -e "${GREEN}✅ Fichiers mis à jour avec succès!${NC}"
echo ""
echo -e "${YELLOW}📋 Prochaines étapes:${NC}"
echo ""
echo "1. Vérifier les changements:"
echo "   git diff"
echo ""
echo "2. Commiter les changements:"
echo "   git add app.config.js package.json ios/PadelSync/Info.plist"
echo "   git commit -m \"chore: Préparer build $NEW_VERSION ($NEW_BUILD)\""
echo ""
echo "3. Créer le build iOS:"
echo "   npx eas build --platform ios --profile production"
echo ""
echo "4. Créer le build Android:"
echo "   npx eas build --platform android --profile production"
echo ""
echo "5. Soumettre les builds:"
echo "   npx eas submit --platform ios --latest"
echo "   npx eas submit --platform android --latest"
echo ""

