# Guide détaillé : Sélectionner votre PAGE Facebook dans Graph API Explorer

## Pourquoi c'est important ?

Si vous générez le token pour votre **compte utilisateur** au lieu de votre **PAGE Facebook**, vous obtiendrez l'erreur :
- "Aucune page Facebook trouvée"
- "Impossible de récupérer l'ID du compte Instagram Business"

**Solution** : Générer le token directement pour votre PAGE Facebook.

---

## 📋 Étape par étape

### Étape 1 : Accéder à Graph API Explorer

1. Ouvrez votre navigateur
2. Allez sur : **https://developers.facebook.com/tools/explorer/**
3. Connectez-vous avec votre compte Facebook si nécessaire

### Étape 2 : Sélectionner votre application

1. En haut à droite, vous verrez un menu déroulant **"Meta App"** ou **"Application Meta"**
2. Cliquez dessus
3. **Recommandation : Utilisez "Graph API Explorer"** (application par défaut)
   - ✅ Pas besoin de configuration
   - ✅ Pas de problème de réassociation
   - ✅ Fonctionne immédiatement
   - ⚠️ Le token expire dans 1-2 heures (mais permet de tester)

4. Si vous choisissez "Padel Sync" ou une autre application :
   - Vous pourriez voir une page "Réassocier" qui ne fonctionne pas
   - Dans ce cas, revenez à "Graph API Explorer"

### Étape 3 : Sélectionner votre PAGE Facebook (IMPORTANT)

1. Juste en dessous du menu "Meta App", vous verrez un autre menu déroulant :
   - **"Utilisateur ou Page"** (en français)
   - Ou **"User or Page"** (en anglais)
   - Ou **"Obtenir le token"** (parfois)

2. **Cliquez sur ce menu déroulant**

3. **Vous verrez une liste avec deux types d'éléments :**
   - Votre **nom** ou **email** (votre compte utilisateur) ❌ **NE PAS SÉLECTIONNER**
   - Le **nom de votre page Facebook** (ex: "Hercule & Hops", "Padel Sync Hazebrouck", etc.) ✅ **SÉLECTIONNER CELUI-CI**

4. **Sélectionnez votre PAGE Facebook** dans la liste

### Étape 4 : Vérifier que c'est bien la page

Après sélection, le menu devrait afficher le **nom de votre page** (pas votre nom personnel).

**Exemples :**
- ✅ Bon : "Hercule & Hops" (nom de la page)
- ✅ Bon : "Padel Sync Hazebrouck" (nom de la page)
- ❌ Mauvais : "Sebastien Bultel" (votre nom personnel)
- ❌ Mauvais : "sebbultel59@gmail.com" (votre email)

### Étape 5 : Générer le token

1. Cliquez sur le bouton bleu **"Generate Access Token"** ou **"Générer un token d'accès"**
2. Une fenêtre s'ouvre pour sélectionner les permissions

### Étape 6 : Sélectionner les permissions

Cochez **TOUTES** ces permissions (obligatoire) :
- ✅ `instagram_basic` - Accès de base à Instagram
- ✅ `pages_show_list` - Voir la liste de vos pages Facebook
- ✅ `pages_read_engagement` - Lire les données d'engagement des pages

### Étape 7 : Autoriser et copier le token

1. Cliquez sur **"Générer un token d'accès"** ou **"Generate Access Token"**
2. Autorisez l'application si demandé
3. Le token apparaît dans le champ **"Token d'accès"** ou **"Access Token"**
4. **Copiez le token complet** (il est très long)
5. Collez-le dans l'application Padel Sync

---

## 🔍 Comment reconnaître votre PAGE Facebook dans la liste ?

### Indices visuels :

1. **Icône différente** :
   - Les pages ont souvent une icône de **fanion** ou **page**
   - Les comptes utilisateurs ont une icône de **personne**

2. **Nom différent** :
   - La page a le **nom de votre club/entreprise**
   - Votre compte a votre **nom personnel**

3. **Type affiché** :
   - Parfois il y a un label **"Page"** ou **"Utilisateur"**

### Exemple de liste :

```
📄 Hercule & Hops          ← PAGE (sélectionner celle-ci)
👤 Sebastien Bultel        ← Compte utilisateur (ne pas sélectionner)
📄 Padel Sync Hazebrouck   ← PAGE (si vous en avez plusieurs)
```

---

## ❓ Je ne vois pas ma page dans la liste

Si votre page Facebook n'apparaît pas dans la liste, cela signifie que :

### Problème 1 : Votre compte Instagram n'est pas connecté à une page Facebook

**Solution :**

1. Ouvrez **Instagram** sur votre téléphone
2. Allez dans **Paramètres** (icône ⚙️ en haut à droite)
3. Allez dans **Compte**
4. Cliquez sur **"Passer à un compte professionnel"** ou **"Passer à un compte créateur"**
5. Suivez les étapes
6. Quand demandé, **connectez votre compte à une page Facebook**
   - Si vous n'avez pas de page, créez-en une sur Facebook d'abord
7. Une fois connecté, retournez sur Graph API Explorer et réessayez

### Problème 2 : Vous n'avez pas les droits administrateur sur la page

**Solution :**

1. Allez sur **Facebook.com**
2. Allez sur votre page Facebook
3. Vérifiez que vous êtes **administrateur** de la page
4. Si vous n'êtes pas admin, demandez à un administrateur de vous donner les droits

### Problème 3 : La page n'existe pas encore

**Solution :**

1. Créez une page Facebook :
   - Allez sur **facebook.com/pages/create**
   - Suivez les étapes pour créer la page
   - Donnez-lui le nom de votre club
2. Connectez votre Instagram à cette nouvelle page (voir Problème 1)
3. Retournez sur Graph API Explorer

---

## ✅ Vérification finale

Avant de copier le token, vérifiez que :

1. ✅ Le menu "Utilisateur ou Page" affiche le **nom de votre page** (pas votre nom personnel)
2. ✅ Vous avez sélectionné les **3 permissions** requises
3. ✅ Le token est **complet** (très long, commence généralement par "EA" ou "IGA")

---

## 🎯 Résumé rapide

1. Graph API Explorer → Menu "Meta App" → Sélectionner application
2. Menu "Utilisateur ou Page" → **Sélectionner votre PAGE** (pas votre compte)
3. "Generate Access Token" → Cocher les 3 permissions → Générer
4. Copier le token → Coller dans l'app Padel Sync

---

## 📞 Besoin d'aide ?

Si après avoir suivi ce guide vous avez toujours des problèmes :
- Vérifiez que votre compte Instagram est bien un compte **Business** ou **Creator**
- Vérifiez que votre compte Instagram est bien **connecté à une page Facebook**
- Essayez avec l'application **"Graph API Explorer"** par défaut (fonctionne sans configuration)

