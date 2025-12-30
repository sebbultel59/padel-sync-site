-- Migration: Ajout des préférences reminder_24h, reminder_2h et nouvelles notifications aux préférences existantes
-- Date: 2025-01-XX
-- Cette migration met à jour les profils existants pour ajouter les nouvelles préférences

-- Mettre à jour les profils existants qui n'ont pas encore les nouvelles préférences
UPDATE profiles
SET notification_preferences = COALESCE(notification_preferences, '{}'::jsonb) || '{
  "reminder_24h": true,
  "reminder_2h": true,
  "badge_unlocked": true,
  "match_result_recorded": true,
  "group_join_request_approved": true,
  "group_join_request_rejected": true
}'::jsonb
WHERE notification_preferences IS NULL 
   OR NOT (notification_preferences ? 'reminder_24h')
   OR NOT (notification_preferences ? 'reminder_2h')
   OR NOT (notification_preferences ? 'badge_unlocked')
   OR NOT (notification_preferences ? 'match_result_recorded')
   OR NOT (notification_preferences ? 'group_join_request_approved')
   OR NOT (notification_preferences ? 'group_join_request_rejected');

-- Note: Les nouveaux profils auront automatiquement ces préférences grâce à la valeur par défaut
-- de la colonne notification_preferences (si la migration add_notification_preferences_to_profiles.sql
-- a été mise à jour avec les nouvelles valeurs par défaut)

