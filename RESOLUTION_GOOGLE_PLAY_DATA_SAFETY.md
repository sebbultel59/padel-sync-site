# Résolution du problème de sécurité des données Google Play

## 🔍 Problème identifié

Google Play a détecté que votre application transmet des **"Appareil ou autres ID"** (Device or other IDs) hors de l'appareil sans les avoir déclarés dans le formulaire de sécurité des données.

## 📋 Cause du problème

Votre application utilise **Expo Push Notifications** qui collecte automatiquement des IDs d'appareil pour générer les tokens push nécessaires aux notifications.

**Détails techniques :**
- L'application utilise `expo-notifications` pour obtenir des tokens Expo Push Token
- Ces tokens sont générés par Expo et nécessitent l'accès aux IDs d'appareil
- Les notifications sont envoyées via l'API Expo (`https://exp.host/--/api/v2/push/send`)
- Les métadonnées Firebase dans `AndroidManifest.xml` sont ajoutées automatiquement par Expo pour la compatibilité Android, mais Firebase n'est pas utilisé directement

**SDK concernés :**
1. **Expo Notifications** (`expo-notifications`) - Collecte des IDs d'appareil pour les tokens push
2. **Expo SDK** - Peut collecter des IDs d'appareil automatiquement

## ✅ Solution recommandée : Déclarer les IDs d'appareil

Puisque votre application utilise les notifications push, vous **devez** collecter des IDs d'appareil. La solution est de les déclarer correctement dans Google Play Console.

### Étapes à suivre dans Google Play Console

1. **Accéder au formulaire de sécurité des données**
   - Allez sur [Google Play Console](https://play.google.com/console)
   - Sélectionnez votre application "Padel Sync"
   - Allez dans **Contenu de l'application** > **Sécurité des données**

2. **Déclarer les IDs d'appareil**
   - Dans la section **"Données collectées"**, trouvez **"Appareil ou autres ID"**
   - Cochez **"Oui"** pour indiquer que vous collectez ces données
   - Indiquez que ces données sont :
     - ✅ **Collectées** : Oui
     - ✅ **Partagées** : Oui (avec Expo et Firebase pour les notifications)
     - ✅ **Utilisation** : 
       - Analyse
       - Fonctionnalités de l'application (notifications push)
       - Communication avec les utilisateurs

3. **Déclarer les SDK tiers**
   - Dans la section des SDK tiers, déclarez :
     - **Expo** (expo-notifications) - Consultez le [Google Play SDK Index](https://safety.google/intl/fr_fr/stories/google-play-safety/) pour les déclarations spécifiques
   - Note : Les métadonnées Firebase dans le manifeste sont ajoutées automatiquement par Expo mais Firebase n'est pas utilisé directement

4. **Mettre à jour la politique de confidentialité**
   - Assurez-vous que votre politique de confidentialité mentionne la collecte d'IDs d'appareil pour les notifications push
   - Lien vers la politique : `https://syncpadel.app/privacy` (vérifiez que ce lien est correct)

5. **Soumettre une nouvelle version**
   - Après avoir mis à jour le formulaire, soumettez à nouveau la version 38 (ou une nouvelle version)

## 🔧 Solution alternative : Désactiver la collecte (NON RECOMMANDÉ)

Si vous souhaitez vraiment éviter de déclarer les IDs d'appareil, vous devriez :

1. **Supprimer les notifications push** - Cela casserait une fonctionnalité importante de votre application
2. **Utiliser uniquement des notifications locales** - Limiterait grandement les fonctionnalités (pas de notifications en arrière-plan)

⚠️ **Cette solution n'est PAS recommandée** car :
- Les notifications push sont essentielles pour votre application (matchs, groupes, etc.)
- Les utilisateurs s'attendent à recevoir des notifications même quand l'app est fermée
- La déclaration des IDs d'appareil est une pratique standard et légale pour les applications avec notifications push

## 📝 Fichiers concernés

- `lib/notifications.js` - Utilise `expo-notifications` pour obtenir les tokens push (ligne 116 : `getExpoPushTokenAsync`)
- `app.config.js` - Configure `expo-notifications` plugin (lignes 82-88)
- `android/app/src/main/AndroidManifest.xml` - Contient les métadonnées Firebase ajoutées automatiquement par Expo
- `supabase/functions/dispatch-notifs/index.ts` - Envoie les notifications via l'API Expo

## 🎯 Action immédiate

**Option 1 (Recommandée)** : Déclarer les IDs d'appareil dans Google Play Console comme décrit ci-dessus.

**Option 2** : Si vous voulez vraiment éviter la collecte (non recommandé), je peux vous aider à :
- Modifier le système de notifications pour utiliser uniquement des notifications locales
- Retirer complètement les notifications push (cela casserait une fonctionnalité importante)

## 📚 Ressources

- [Google Play SDK Index](https://safety.google/intl/fr_fr/stories/google-play-safety/)
- [Documentation Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Guide Google Play Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469)

