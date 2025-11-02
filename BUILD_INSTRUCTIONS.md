# Instructions pour créer un build et le soumettre à App Store Connect

## Prérequis

1. **Compte Apple Developer actif**
   - Vous devez avoir un compte Apple Developer payant ($99/an)
   - Votre compte doit avoir accès à App Store Connect

2. **Vérifier votre connexion EAS** :
   ```bash
   npx eas whoami
   ```

## Configuration actuelle

- **Version** : 1.1.4
- **Build Number** : 1.1.4
- **Bundle Identifier** : app.syncpadel.mobile
- **Apple Team ID** : F2MNK9R7Q8

## Étape 1 : Créer le build de production iOS

Lancez la commande suivante :

```bash
npx eas build --platform ios --profile production
```

### Pendant le build, vous devrez :

1. **Se connecter à votre compte Apple** (si demandé) :
   - Entrez votre Apple ID (email)
   - Entrez votre mot de passe
   - Entrez le code de vérification à deux facteurs si activé
   
   ⚠️ **Important** : EAS va stocker vos credentials de manière sécurisée pour les prochains builds.

2. **Attendre la fin du build** (15-30 minutes) :
   - Le build va se créer sur les serveurs EAS
   - Vous pouvez suivre la progression dans le terminal
   - Vous recevrez un lien pour suivre le build sur le dashboard EAS

### Si vous préférez ne pas entrer vos identifiants Apple

Vous pouvez configurer les credentials manuellement :

```bash
npx eas credentials
```

Puis sélectionnez :
- iOS → Production → Setup credentials

## Étape 2 : Vérifier que l'app existe dans App Store Connect

1. Allez sur [App Store Connect](https://appstoreconnect.apple.com)
2. Connectez-vous avec votre Apple ID
3. Vérifiez que l'app **Padel Sync** existe avec le bundle ID `app.syncpadel.mobile`
4. Si l'app n'existe pas, créez-la :
   - Cliquez sur "Mes apps" → "+"
   - Remplissez les informations de base
   - Bundle ID : `app.syncpadel.mobile`

## Étape 3 : Soumettre le build à App Store Connect

Une fois le build terminé avec succès, vous avez deux options :

### Option A : Soumission automatique (recommandée)

```bash
npx eas submit --platform ios --latest
```

Cette commande va :
- Trouver le dernier build de production iOS
- Le soumettre automatiquement à App Store Connect
- Utiliser les credentials déjà configurés

### Option B : Soumission manuelle

1. **Télécharger le build depuis EAS** :
   - Allez sur [expo.dev](https://expo.dev)
   - Connectez-vous à votre compte
   - Allez dans votre projet "padel-sync"
   - Cliquez sur "Builds"
   - Trouvez votre build iOS de production
   - Téléchargez le fichier `.ipa`

2. **Soumettre via Transporter (macOS)** :
   - Ouvrez l'app Transporter (gratuite depuis le Mac App Store)
   - Glissez-déposez le fichier `.ipa`
   - Cliquez sur "Deliver"

3. **Ou soumettre via Xcode** :
   - Ouvrez Xcode
   - Window → Organizer
   - Cliquez sur "Distribute App"
   - Suivez les instructions

## Étape 4 : Compléter les informations dans App Store Connect

Une fois le build soumis :

1. **Allez sur App Store Connect** → Votre app → Version

2. **Remplissez les informations requises** :
   - Description de l'app
   - Captures d'écran (obligatoires)
     - iPhone 6.7" (iPhone 14 Pro Max)
     - iPhone 6.5" (iPhone 11 Pro Max)  
     - iPad Pro 12.9"
   - Mots-clés
   - Support URL
   - URL de confidentialité
   - Catégorie
   - Note de version

3. **Configurez les informations de pricing** :
   - Prix
   - Disponibilité géographique

4. **Soumettez pour review** :
   - Cliquez sur "Soumettre pour examen"
   - Répondez aux questions de conformité export
   - Confirmez la soumission

## Durée du processus

- **Build** : 15-30 minutes
- **Soumission** : Quelques minutes
- **Review Apple** : 24-48 heures (parfois plus)

## Dépannage

### Erreur "Bundle identifier mismatch"
- Vérifiez que le bundle ID dans `app.config.js` correspond à celui dans App Store Connect

### Erreur "Invalid credentials"
- Vérifiez que votre Apple Team ID est correct : `F2MNK9R7Q8`
- Vérifiez que votre compte Apple Developer a les permissions nécessaires

### Erreur "App not found in App Store Connect"
- Créez l'app dans App Store Connect avant de soumettre le build
- Ou utilisez l'option `--create-app` lors de la soumission

### Build échoue avec erreur native
- Vérifiez que toutes les dépendances natives sont correctement installées
- Vérifiez les logs détaillés sur le dashboard EAS

## Commandes utiles

```bash
# Voir la liste des builds
npx eas build:list --platform ios

# Voir les détails d'un build spécifique
npx eas build:view [BUILD_ID]

# Annuler un build en cours
npx eas build:cancel [BUILD_ID]

# Voir les credentials configurés
npx eas credentials
```

## Notes importantes

- ✅ react-native-maps sera automatiquement inclus dans le build (pas besoin de configuration supplémentaire)
- ✅ Toutes les permissions sont configurées dans `app.config.js`
- ✅ Le build number et la version sont à jour (1.1.4)
- ⚠️ Assurez-vous que tous les assets (icônes, splash screens) sont présents
- ⚠️ Testez l'app localement avant de créer le build de production

## Support

Si vous rencontrez des problèmes :
1. Consultez les logs détaillés sur le dashboard EAS
2. Consultez la [documentation EAS](https://docs.expo.dev/build/introduction/)
3. Contactez le support Expo via leur dashboard
