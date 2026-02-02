-- Migration: Ajout de la préférence availability_reminder aux profils
-- Date: 2026-01-27

UPDATE profiles
SET notification_preferences = COALESCE(notification_preferences, '{}'::jsonb) || '{
  "availability_reminder": true
}'::jsonb
WHERE notification_preferences IS NULL
   OR NOT (notification_preferences ? 'availability_reminder');
