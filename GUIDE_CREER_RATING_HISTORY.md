# Guide : Créer la table rating_history dans Supabase

## 📋 Étape par étape

### Option 1 : Via le Dashboard Supabase (Recommandé)

1. **Ouvrir le Dashboard Supabase**
   - Allez sur https://supabase.com/dashboard
   - Connectez-vous à votre compte
   - Sélectionnez votre projet

2. **Accéder au SQL Editor**
   - Dans le menu de gauche, cliquez sur **"SQL Editor"** (icône avec `</>`)
   - Ou utilisez le raccourci : `Cmd/Ctrl + K` puis tapez "SQL Editor"

3. **Créer une nouvelle requête**
   - Cliquez sur le bouton **"+ New query"** en haut à droite
   - Ou utilisez le raccourci : `Cmd/Ctrl + N`

4. **Copier le SQL**
   - Ouvrez le fichier : `supabase/migrations/20251206120000_create_rating_history_if_missing.sql`
   - Copiez tout le contenu (`Cmd/Ctrl + A` puis `Cmd/Ctrl + C`)

5. **Coller et exécuter**
   - Collez le SQL dans l'éditeur (`Cmd/Ctrl + V`)
   - Cliquez sur le bouton **"Run"** en bas à droite
   - Ou utilisez le raccourci : `Cmd/Ctrl + Enter`

6. **Vérifier le résultat**
   - Vous devriez voir un message de succès : "Success. No rows returned"
   - Si vous voyez une erreur, vérifiez les messages d'erreur

### Option 2 : Via la CLI Supabase

Si vous avez la CLI Supabase installée et configurée :

```bash
# Depuis le répertoire du projet
cd /Users/sebbultel/padel-sync

# Appliquer toutes les migrations en attente
supabase db push

# Ou exécuter une migration spécifique
supabase db execute --file supabase/migrations/20251206120000_create_rating_history_if_missing.sql
```

### Option 3 : SQL direct (copier-coller)

Si vous préférez copier directement le SQL, voici le contenu :

```sql
-- Migration: Créer rating_history si elle n'existe pas
-- Date: 2025-12-06

CREATE TABLE IF NOT EXISTS rating_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating_before NUMERIC(10, 2) NOT NULL CHECK (rating_before >= 0),
  rating_after NUMERIC(10, 2) NOT NULL CHECK (rating_after >= 0),
  delta NUMERIC(10, 2) NOT NULL,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rating_history_user_id ON rating_history(user_id);
CREATE INDEX IF NOT EXISTS idx_rating_history_match_id ON rating_history(match_id) WHERE match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rating_history_created_at ON rating_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rating_history_user_created ON rating_history(user_id, created_at DESC);

COMMENT ON TABLE rating_history IS 'Historique des changements de rating pour chaque joueur';
COMMENT ON COLUMN rating_history.rating_before IS 'Rating avant le match';
COMMENT ON COLUMN rating_history.rating_after IS 'Rating après le match';
COMMENT ON COLUMN rating_history.delta IS 'Changement de rating (positif pour victoire, négatif pour défaite)';
COMMENT ON COLUMN rating_history.match_id IS 'ID du match qui a causé ce changement (nullable pour ajustements manuels)';

ALTER TABLE rating_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view rating history" ON rating_history;
CREATE POLICY "Anyone can view rating history"
  ON rating_history
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage rating history" ON rating_history;
CREATE POLICY "Admins can manage rating history"
  ON rating_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );
```

## ✅ Vérification

Après avoir exécuté la migration, vérifiez que la table existe :

```sql
-- Vérifier que la table existe
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'rating_history';

-- Vérifier la structure de la table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'rating_history';
```

## 🎯 Résultat attendu

Après l'exécution :
- ✅ La table `rating_history` est créée
- ✅ Les index sont créés
- ✅ Les politiques RLS sont configurées
- ✅ L'Edge Function `record-match-result` pourra insérer des entrées sans erreur

## ⚠️ En cas d'erreur

Si vous voyez une erreur comme "relation already exists", c'est normal : la table existe déjà. La migration utilise `CREATE TABLE IF NOT EXISTS`, donc elle ne fera rien si la table existe déjà.

Si vous voyez une autre erreur, copiez le message d'erreur complet et je vous aiderai à le résoudre.

