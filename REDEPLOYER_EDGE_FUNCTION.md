# Guide : Redéployer l'Edge Function record-match-result

## 🔧 Problème

L'erreur dans les logs montre que l'ancienne version de l'Edge Function est toujours déployée. Il faut redéployer pour que les corrections prennent effet.

## 📋 Étapes pour redéployer

### Option 1 : Via la CLI Supabase (Recommandé)

```bash
# Depuis le répertoire du projet
cd /Users/sebbultel/padel-sync

# Redéployer l'Edge Function
supabase functions deploy record-match-result
```

### Option 2 : Via le Dashboard Supabase

1. Allez dans **"Edge Functions"** dans le Dashboard
2. Cliquez sur **"record-match-result"**
3. Cliquez sur **"Deploy"** ou **"Redeploy"**
4. Attendez que le déploiement se termine

## ✅ Vérification après déploiement

1. Enregistrez un nouveau match via l'app
2. Vérifiez les logs de l'Edge Function :
   - Vous ne devriez **plus** voir l'erreur `invalid input value for enum match_status: "completed"`
   - Vous devriez voir : `[record_match_result] Match result recorded, matches.status unchanged`
   - Vous devriez voir : `[record_match_result] Rating history inserted successfully: X`

## 🔍 Vérifier rating_history

Après avoir enregistré un match, vérifiez que des entrées sont créées :

```sql
-- Vérifier les dernières entrées dans rating_history
SELECT 
  id,
  user_id,
  rating_before,
  rating_after,
  delta,
  match_id,
  created_at
FROM rating_history
ORDER BY created_at DESC
LIMIT 10;
```

Si aucune entrée n'apparaît, vérifiez les logs de l'Edge Function pour voir s'il y a une erreur lors de l'insertion.

