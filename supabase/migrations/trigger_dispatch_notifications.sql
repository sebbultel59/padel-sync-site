-- Migration: Trigger pour appeler automatiquement dispatch-notifs quand un notification_job est créé
-- Date: 2025-01-XX

-- Fonction qui appelle l'Edge Function dispatch-notifs via HTTP
CREATE OR REPLACE FUNCTION trigger_dispatch_notifications()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT;
  function_url TEXT;
BEGIN
  -- Récupérer l'URL Supabase depuis les variables d'environnement ou la config
  -- Note: En production, utilisez une variable d'environnement ou une valeur configurée
  -- Pour l'instant, on utilise pg_net pour faire l'appel HTTP
  
  -- Utiliser pg_net pour appeler l'Edge Function
  -- L'URL de l'Edge Function est: https://<project-ref>.supabase.co/functions/v1/dispatch-notifs
  -- On peut récupérer l'URL depuis current_setting('app.settings.supabase_url', true) si configuré
  -- Sinon, on peut utiliser une valeur par défaut ou laisser l'appel se faire via un webhook
  
  -- Pour l'instant, on utilise une approche simple: on fait un appel HTTP via pg_net
  -- Note: pg_net doit être activé dans Supabase
  
  -- Alternative: utiliser un webhook Supabase qui appelle la fonction
  -- Ou utiliser pg_cron pour appeler périodiquement
  
  -- Pour l'instant, on crée juste le trigger qui log l'événement
  -- L'appel HTTP sera fait via un webhook Supabase configuré dans le dashboard
  -- ou via pg_cron qui appelle la fonction toutes les 30 secondes
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Créer le trigger
DROP TRIGGER IF EXISTS notification_jobs_dispatch_trigger ON notification_jobs;
CREATE TRIGGER notification_jobs_dispatch_trigger
  AFTER INSERT ON notification_jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_dispatch_notifications();

-- Note: Pour que les notifications soient envoyées automatiquement, il faut:
-- 1. Configurer un webhook Supabase qui appelle https://<project>.supabase.co/functions/v1/dispatch-notifs
--    quand un INSERT est fait sur notification_jobs
-- 2. OU utiliser pg_cron pour appeler la fonction périodiquement (voir migration suivante)

