# Guide de déclaration des données - Google Play Console

## ✅ Ce qu'il faut cocher dans le formulaire de sécurité des données

### 🔴 OBLIGATOIRE (problème détecté par Google Play)

#### **Appareil ou autres ID**
- ✅ **Cocher** : "Appareil ou autres ID"
- **Raison** : L'application utilise `expo-notifications` pour les notifications push, qui collecte des IDs d'appareil

---

### 📍 Emplacement (1/2 type sélectionné)

#### **Emplacement approximatif**
- ✅ **Cocher** : "Emplacement approximatif"
- **Raison** : L'application utilise `expo-location` pour trouver les clubs de padel proches (permissions `ACCESS_COARSE_LOCATION` et `ACCESS_FINE_LOCATION`)

#### **Emplacement précis**
- ❓ **À vérifier** : Si vous utilisez uniquement la localisation approximative pour trouver les clubs, vous pouvez ne pas cocher "Emplacement précis". Sinon, cochez-le aussi.

---

### 👤 Informations personnelles (4/9 types sélectionnés)

Cochez les types suivants :

1. ✅ **Nom** - Les utilisateurs ont un `display_name` dans leur profil
2. ✅ **Adresse e-mail** - Collectée lors de l'inscription/connexion
3. ✅ **Numéro de téléphone** - Champ `phone` dans le profil (optionnel mais collecté si fourni)
4. ✅ **Adresse** - Les utilisateurs peuvent enregistrer `address_home` et `address_work`

**Ne pas cocher** (non collectés) :
- ❌ Identifiant utilisateur (l'ID est généré par Supabase, pas collecté séparément)
- ❌ Autres informations d'identification
- ❌ Date de naissance
- ❌ Sexe
- ❌ Autres informations personnelles

---

### 💬 Messages (2/3 types sélectionnés)

Cochez les types suivants :

1. ✅ **Autres messages dans l'appli** - Les notifications push sont des messages
2. ✅ **Autres actions dans l'appli** - Les notifications concernent les matchs, groupes, etc.

**Ne pas cocher** :
- ❌ SMS ou MMS (non utilisé)

---

### 📸 Photos et vidéos (1/2 type sélectionné)

1. ✅ **Photos** - Les utilisateurs peuvent uploader des photos de profil via `expo-image-picker`
   - Permission : `CAMERA`, `READ_MEDIA_IMAGES`, `NSPhotoLibraryUsageDescription`

**Ne pas cocher** :
- ❌ Vidéos (non collectées)

---

### 📅 Agenda (0/1 type sélectionné)

1. ✅ **Événements du calendrier** - L'application permet d'ajouter des matchs au calendrier
   - Permission : `NSCalendarsUsageDescription`

---

### 📱 Activité dans les applis

Cochez les types suivants :

1. ✅ **Interactions avec l'appli** - Les utilisateurs interagissent avec l'app (création de matchs, groupes, etc.)
2. ✅ **Autre contenu généré par l'utilisateur** - Les utilisateurs créent du contenu (matchs, groupes, disponibilités)

**Ne pas cocher** :
- ❌ Historique des recherches via une appli (pas de fonctionnalité de recherche)
- ❌ Applis installées (non collecté)

---

### ❌ Ne PAS cocher (non collectés)

- **Infos financières** - Aucune donnée financière collectée
- **Santé et remise en forme** - Non collecté
- **Fichiers audio** - Non collecté
- **Fichiers et documents** - Non collecté
- **Contacts** - Non collecté (les groupes sont différents des contacts)
- **Navigation sur le Web** - Non collecté
- **Infos et performance des applis** - Non collecté (sauf si vous utilisez des analytics)

---

## 📝 Résumé des catégories à cocher

| Catégorie | Types à cocher |
|-----------|----------------|
| **Appareil ou autres ID** | ✅ Appareil ou autres ID |
| **Emplacement** | ✅ Emplacement approximatif (et précis si utilisé) |
| **Informations personnelles** | ✅ Nom, Adresse e-mail, Numéro de téléphone, Adresse |
| **Messages** | ✅ Autres messages dans l'appli, Autres actions dans l'appli |
| **Photos et vidéos** | ✅ Photos |
| **Agenda** | ✅ Événements du calendrier |
| **Activité dans les applis** | ✅ Interactions avec l'appli, Autre contenu généré par l'utilisateur |

---

## ⚠️ Important

Après avoir coché tous les types de données, vous devrez également indiquer pour chaque type :
- **Collectées** : Oui/Non
- **Partagées** : Oui/Non (avec Expo pour les notifications, Supabase pour l'hébergement)
- **Utilisation** : Fonctionnalités de l'application, Communication avec les utilisateurs, etc.

---

## 🔗 Références

- Voir `RESOLUTION_GOOGLE_PLAY_DATA_SAFETY.md` pour plus de détails sur le problème des IDs d'appareil
- Voir `public/privacy/index.html` pour la politique de confidentialité actuelle



