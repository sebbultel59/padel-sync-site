-- Migration: Ajout de la colonne notification_preferences à la table profiles
-- Date: 2025-01-XX

-- Ajouter la colonne notification_preferences (JSONB pour stocker les préférences par type)
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
    "match_created": true,
    "match_confirmed": true,
    "match_validated": true,
    "match_canceled": true,
    "rsvp_accepted": true,
    "rsvp_declined": true,
    "rsvp_removed": true,
    "group_member_joined": true,
    "group_member_left": true,
    "reminder_24h": true,
    "reminder_2h": true,
    "badge_unlocked": true,
    "match_result_recorded": true,
    "group_join_request_approved": true,
    "group_join_request_rejected": true
  }'::jsonb;

-- Commentaire pour documenter la colonne
COMMENT ON COLUMN profiles.notification_preferences IS 'Préférences de notifications push par type (true = activé, false = désactivé)';

