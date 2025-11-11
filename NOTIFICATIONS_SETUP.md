# Configuration des Notifications Push iPhone

## Problème
Les notifications apparaissent dans l'application (clochette) mais pas sur les notifications iPhone.

## Solutions mises en place

### 1. Enregistrement du token push
✅ **Fait** : Le token Expo Push est maintenant enregistré automatiquement au démarrage de l'app via `registerPushToken()` dans `app/_layout.js`.

### 2. Configuration iOS
✅ **Vérifié** : La configuration iOS est correcte dans `app.config.js` :
- `UIBackgroundModes: ["remote-notification"]` est présent
- Le `projectId` EAS est configuré
- Le plugin `expo-notifications` est configuré

### 3. Handler de notifications
✅ **Amélioré** : Le handler de notifications a été mis à jour pour :
- Activer le son (`shouldPlaySound: true`)
- Activer le badge (`shouldSetBadge: true`)
- Logger les notifications reçues pour le debug

### 4. Écoute des notifications push
✅ **Ajouté** : Des listeners ont été ajoutés dans `app/(tabs)/_layout.js` pour :
- Détecter les notifications reçues
- Recharger automatiquement la liste des notifications

## Configuration requise côté serveur

### Option 1 : Webhook Supabase (Recommandé - Le plus simple)

1. Aller dans le dashboard Supabase : **Database > Webhooks**
2. Créer un nouveau webhook :
   - **Table** : `notification_jobs`
   - **Events** : `INSERT`
   - **HTTP Request** :
     - **URL** : `https://YOUR_PROJECT_REF.supabase.co/functions/v1/dispatch-notifs`
     - **Method** : `POST`
     - **Headers** : 
       ```
       Content-Type: application/json
       Authorization: Bearer YOUR_SERVICE_ROLE_KEY
       ```
     - **Body** : `{}` (vide, la fonction lit directement depuis la table)

### Option 2 : Trigger PostgreSQL avec pg_net

1. Exécuter la migration `supabase/migrations/auto_dispatch_notifications.sql`
2. Configurer les variables d'environnement dans Supabase :
   ```sql
   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
   ALTER DATABASE postgres SET app.settings.supabase_anon_key = 'YOUR_ANON_KEY';
   ```
3. Activer l'extension pg_net :
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_net;
   ```

### Option 3 : Cron job (Alternative)

1. Exécuter la migration `supabase/migrations/cron_dispatch_notifications.sql`
2. Modifier l'URL et la clé dans le fichier avant d'exécuter
3. Le cron appellera la fonction toutes les 30 secondes

## Vérifications

### 1. Vérifier que le token est enregistré
```sql
SELECT id, display_name, expo_push_token 
FROM profiles 
WHERE expo_push_token IS NOT NULL;
```

Le token doit commencer par `ExponentPushToken[`.

### 2. Vérifier que les notification_jobs sont créés
```sql
SELECT * FROM notification_jobs 
ORDER BY created_at DESC 
LIMIT 10;
```

### 3. Vérifier que dispatch-notifs est appelé
- Aller dans **Supabase Dashboard > Edge Functions > dispatch-notifs > Logs**
- Vérifier que la fonction est appelée et qu'elle envoie les notifications

### 4. Tester manuellement
Appeler la fonction Edge manuellement :
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/dispatch-notifs \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

## Debug

### Logs à vérifier dans l'app
- `✅ PUSH: token = ExponentPushToken[...]` - Token généré
- `💾 Token enregistré avec succès` - Token sauvegardé en base
- `[Notifications] Notification reçue:` - Notification reçue dans l'app
- `[Layout] Notification push reçue:` - Notification détectée par le listener

### Problèmes courants

1. **Token non enregistré**
   - Vérifier les permissions de notification
   - Vérifier que l'app est sur un vrai appareil (pas simulateur)
   - Vérifier les logs dans la console

2. **Notifications non envoyées**
   - Vérifier que `dispatch-notifs` est appelé (webhook/trigger/cron)
   - Vérifier les logs de l'Edge Function
   - Vérifier que les tokens sont valides dans la base

3. **Notifications reçues dans l'app mais pas sur iPhone**
   - Vérifier les permissions iOS dans Réglages > Padel Sync > Notifications
   - Vérifier que l'app n'est pas en mode "Ne pas déranger"
   - Vérifier que les notifications ne sont pas désactivées pour l'app

## Prochaines étapes

1. **Configurer le webhook** (Option 1 recommandée)
2. **Tester** en créant un `notification_job` manuellement
3. **Vérifier les logs** pour confirmer que tout fonctionne
4. **Tester sur un vrai iPhone** (pas simulateur)

