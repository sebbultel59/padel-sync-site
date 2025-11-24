# Vérification de la réception des notifications

## Problème
Les notifications sont envoyées avec succès à Expo (`status: "ok"`), mais l'utilisateur ne les reçoit pas.

## Causes possibles

### 1. Tokens Expo invalides ou expirés
- Expo peut retourner `status: "ok"` même si le token est invalide
- Les tokens peuvent expirer si l'app n'a pas été ouverte depuis longtemps
- Vérifiez avec `VERIFY_EXPO_TOKENS.sql`

### 2. Permissions de notification
- Sur iOS : Vérifiez dans Réglages > Notifications > [Nom de l'app]
- Sur Android : Vérifiez dans Paramètres > Applications > [Nom de l'app] > Notifications

### 3. App en arrière-plan
- Les notifications peuvent ne pas être reçues si l'app est complètement fermée
- Vérifiez que l'app a les permissions pour recevoir des notifications en arrière-plan

### 4. Appels multiples
- Le trigger appelle `dispatch-notifs` plusieurs fois
- Cela peut causer des doublons même si le marquage `sent_at` fonctionne

## Actions à faire

1. **Vérifier les tokens Expo** :
   ```sql
   -- Exécutez VERIFY_EXPO_TOKENS.sql
   ```

2. **Vérifier les permissions de notification** :
   - Sur l'appareil, allez dans les réglages de l'app
   - Vérifiez que les notifications sont activées

3. **Tester avec une notification de test** :
   - Créez une nouvelle notification de club
   - Vérifiez les logs dans Supabase Dashboard > Edge Functions > dispatch-notifs > Logs
   - Vérifiez que le token Expo est valide

4. **Vérifier les appels multiples** :
   - Les logs montrent que `dispatch-notifs` est appelé plusieurs fois
   - Cela peut être dû au trigger qui appelle la fonction plusieurs fois
   - Vérifiez avec `VERIFY_DISPATCH_CALLS.sql`

## Solution temporaire

Si les notifications ne sont toujours pas reçues, essayez :
1. Réinstaller l'app pour régénérer le token Expo
2. Vérifier que l'app a les permissions de notification
3. Tester avec une notification de test depuis Expo Dashboard

