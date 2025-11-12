# Comment soumettre un build à TestFlight

## Option 1 : Via Transporter (Mac) - Le plus simple

1. **Télécharger le build depuis EAS** :
   - Allez sur https://expo.dev/accounts/sebbultel/projects/padel-sync/builds
   - Cliquez sur le dernier build (version 1.2.0)
   - Téléchargez le fichier `.ipa`
   - OU utilisez directement : `https://expo.dev/artifacts/eas/dGugoMGB3J6Aw6Ca8YsPGA.ipa`

2. **Installer Transporter** (si pas déjà installé) :
   - Ouvrez le Mac App Store
   - Recherchez "Transporter"
   - Installez-le (gratuit)

3. **Soumettre le build** :
   - Ouvrez Transporter
   - Connectez-vous avec votre Apple ID
   - Glissez-déposez le fichier `.ipa` dans Transporter
   - Cliquez sur "Deliver"
   - Attendez quelques minutes

4. **Tester dans TestFlight** :
   - Le build sera disponible dans App Store Connect → TestFlight
   - Vous pouvez l'installer sur votre iPhone via l'app TestFlight
   - Ou inviter des testeurs via TestFlight

## Option 2 : Via App Store Connect (en ligne)

1. **Télécharger le build** :
   - Allez sur https://expo.dev/accounts/sebbultel/projects/padel-sync/builds
   - Téléchargez le fichier `.ipa` du dernier build

2. **Soumettre via le web** :
   - Allez sur https://appstoreconnect.apple.com
   - Connectez-vous avec votre Apple ID
   - Sélectionnez votre app "Padel Sync"
   - Allez dans l'onglet "TestFlight"
   - Cliquez sur "+" ou "Submit Build"
   - Uploadez le fichier `.ipa`

## Option 3 : Via EAS Submit (ligne de commande)

```bash
# Soumettre le dernier build
npx eas submit --platform ios --latest

# Ou soumettre un build spécifique
npx eas submit --platform ios --id 66d4d579-b3fb-43c5-9bb7-b12a40b620fe
```

⚠️ **Note** : Cette commande nécessite une authentification interactive avec votre Apple ID.

## Après soumission

- ⏱️ **Temps de traitement** : 10-30 minutes
- 📱 **TestFlight** : Le build sera disponible dans TestFlight automatiquement
- ✅ **Installation** : Installez l'app TestFlight sur votre iPhone et testez !

## Important

Pour un build "store" (production), vous **devez** passer par App Store Connect / TestFlight. 
Vous ne pouvez pas installer directement un fichier `.ipa` signé pour le store sur un appareil iOS sans passer par TestFlight ou avoir un compte développeur avec distribution ad-hoc.










