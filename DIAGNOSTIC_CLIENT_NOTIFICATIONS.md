# Diagnostic côté client - Notifications non reçues

## ✅ État serveur (confirmé)
- ✅ Tous les triggers sont actifs
- ✅ 1 notification créée dans les 24h
- ✅ 1 notification envoyée dans les 24h

Le problème est donc **côté client/appareil**.

## 🔍 Vérifications à faire

### 1. Vérifier votre token Expo et préférences

Exécutez cette requête SQL (remplacez par votre email) :

```sql
SELECT 
  id,
  display_name,
  email,
  expo_push_token,
  notification_preferences->'badge_unlocked' as badge_unlocked,
  notification_preferences->'match_result_recorded' as match_result,
  notification_preferences->'group_join_request_approved' as join_approved,
  notification_preferences->'group_join_request_rejected' as join_rejected,
  CASE 
    WHEN expo_push_token IS NULL THEN '❌ Aucun token Expo'
    WHEN expo_push_token LIKE 'ExponentPushToken[%' THEN '✅ Token valide'
    ELSE '⚠️ Token invalide'
  END as token_status
FROM profiles
WHERE email = 'VOTRE_EMAIL@example.com';  -- Remplacez par votre email
```

**Points à vérifier :**
- ✅ `expo_push_token` n'est pas NULL
- ✅ Le token commence par `ExponentPushToken[`
- ✅ Les préférences ne sont pas à `false`

### 2. Vérifier les permissions de notification sur l'appareil

#### Sur iOS :
1. Allez dans **Réglages** > **Notifications**
2. Trouvez votre app "Padel Sync"
3. Vérifiez que les notifications sont **activées**
4. Vérifiez que "Autorisations" inclut les notifications

#### Sur Android :
1. Allez dans **Paramètres** > **Applications** > **Padel Sync**
2. Allez dans **Notifications**
3. Vérifiez que les notifications sont **activées**
4. Vérifiez que "Autorisations" inclut les notifications

### 3. Vérifier dans l'application

1. **Ouvrez l'app Padel Sync**
2. Allez dans **Paramètres** > **Notifications**
3. Vérifiez que :
   - Les notifications push sont activées
   - Les types de notifications sont activés (badge_unlocked, etc.)
4. Si nécessaire, réactivez les permissions

### 4. Vérifier l'état de l'application

Les notifications peuvent ne pas arriver si :
- ❌ L'app est complètement fermée (tuée)
- ❌ Les notifications en arrière-plan sont désactivées
- ❌ Le mode "Ne pas déranger" est activé

**Solution :**
- Gardez l'app ouverte ou en arrière-plan
- Désactivez le mode "Ne pas déranger" temporairement pour tester

### 5. Vérifier les logs Expo Push

Dans Supabase Dashboard :
1. Allez dans **Edge Functions** > **dispatch-notifs** > **Logs**
2. Cherchez les logs récents d'envoi
3. Vérifiez s'il y a des erreurs comme :
   - `DeviceNotRegistered` : Le token est invalide
   - `InvalidCredentials` : Problème de configuration Expo
   - `MessageTooBig` : Le message est trop long

### 6. Tester avec une notification de test

Créez une notification de test manuellement :

```sql
-- Remplacez USER_ID par votre ID utilisateur
INSERT INTO notification_jobs (
  kind,
  actor_id,
  recipients,
  payload,
  created_at
) VALUES (
  'badge_unlocked',
  'VOTRE_USER_ID',  -- Remplacez
  ARRAY['VOTRE_USER_ID'],  -- Remplacez
  jsonb_build_object('message', '🧪 Test de notification - ' || TO_CHAR(NOW(), 'HH24:MI:SS')),
  NOW()
)
RETURNING *;
```

Puis :
1. Attendez 30-60 secondes
2. Vérifiez que `sent_at` est rempli :
```sql
SELECT id, kind, created_at, sent_at 
FROM notification_jobs 
WHERE kind = 'badge_unlocked' 
ORDER BY created_at DESC 
LIMIT 1;
```
3. Vérifiez votre appareil

### 7. Régénérer le token Expo

Si le token est invalide ou manquant :

1. **Dans l'app :**
   - Allez dans les paramètres
   - Désactivez puis réactivez les notifications
   - Cela régénérera le token

2. **Ou via SQL (si vous avez accès) :**
   - Le token sera régénéré automatiquement au prochain démarrage de l'app

### 8. Vérifier la configuration Expo

Si vous utilisez Expo Go :
- ⚠️ Les notifications push ne fonctionnent **pas** dans Expo Go sur Android
- ✅ Utilisez un **development build** ou une **build de production**

## 🔧 Solutions courantes

### Problème : Token Expo manquant ou invalide
**Solution :**
1. Réinstallez l'app
2. Ou réactivez les permissions de notification dans l'app

### Problème : Préférences désactivées
**Solution :**
```sql
-- Réactiver les préférences (remplacez USER_ID)
UPDATE profiles
SET notification_preferences = COALESCE(notification_preferences, '{}'::jsonb) || '{
  "badge_unlocked": true,
  "match_result_recorded": true,
  "group_join_request_approved": true,
  "group_join_request_rejected": true
}'::jsonb
WHERE id = 'VOTRE_USER_ID';
```

### Problème : dispatch-notifs ne s'exécute pas
**Solution :**
1. Vérifiez le cron job dans Supabase Dashboard
2. Ou configurez un webhook qui appelle `dispatch-notifs` quand `notification_jobs` est créé

### Problème : Notifications bloquées par le système
**Solution :**
- Vérifiez les paramètres système de notification
- Vérifiez que l'app n'est pas en mode "Ne pas déranger"
- Vérifiez que les notifications ne sont pas silencieuses

## 📊 Checklist complète

- [ ] Token Expo présent et valide
- [ ] Préférences de notification activées (pas à `false`)
- [ ] Permissions de notification activées sur l'appareil
- [ ] Permissions de notification activées dans l'app
- [ ] L'app est ouverte ou en arrière-plan
- [ ] Le mode "Ne pas déranger" est désactivé
- [ ] `dispatch-notifs` a bien envoyé la notification (`sent_at` rempli)
- [ ] Pas d'erreurs dans les logs Expo Push
- [ ] Utilisation d'un development build (pas Expo Go sur Android)

## 🆘 Si rien ne fonctionne

1. **Vérifiez les logs détaillés :**
   - Supabase Dashboard > Edge Functions > dispatch-notifs > Logs
   - Cherchez les erreurs spécifiques

2. **Testez avec Expo Push directement :**
   - Utilisez l'outil de test Expo : https://expo.dev/notifications
   - Entrez votre token Expo
   - Envoyez une notification de test

3. **Vérifiez la configuration Expo :**
   - Vérifiez que les credentials Expo sont correctement configurés
   - Vérifiez que l'app est bien enregistrée dans Expo










