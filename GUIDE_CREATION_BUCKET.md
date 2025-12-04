# Guide : Créer le bucket club-logos

## Méthode 1 : Script automatique (Recommandé)

### Étape 1 : Obtenir la SERVICE_ROLE_KEY

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet
3. Allez dans **Settings** → **API**
4. Copiez la **"service_role" key** (⚠️ **NE JAMAIS la partager publiquement!**)

### Étape 2 : Créer un fichier .env

Créez un fichier `.env` à la racine du projet avec :

```bash
SUPABASE_URL=https://iieiggyqcncbkjwsdcxl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key_ici
```

**⚠️ Important :** Ajoutez `.env` à votre `.gitignore` pour ne pas commiter la clé secrète !

### Étape 3 : Exécuter le script

```bash
node scripts/create-club-logos-bucket.js
```

Le script va :
- Vérifier si le bucket existe déjà
- Le créer s'il n'existe pas
- Le configurer comme public avec les bonnes limites

## Méthode 2 : Création manuelle dans le Dashboard

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet
3. Allez dans **Storage** (menu de gauche)
4. Cliquez sur **"New bucket"**
5. Configurez le bucket :
   - **Name** : `club-logos`
   - **Public bucket** : ✅ Activé
   - **File size limit** : 5 MB (ou plus)
   - **Allowed MIME types** : `image/jpeg, image/png, image/webp, image/gif` (ou laissez vide)
6. Cliquez sur **"Create bucket"**

## Vérification

Après avoir créé le bucket, testez l'upload d'un logo depuis l'application :
1. Allez dans la page de gestion du club
2. Cliquez sur "Choisir un logo"
3. Sélectionnez une image depuis la galerie
4. Le logo devrait être uploadé et affiché

## Note de sécurité

La **SERVICE_ROLE_KEY** a des permissions élevées. Ne la partagez jamais publiquement et ne la commitez pas dans Git. Utilisez toujours un fichier `.env` qui est dans `.gitignore`.








