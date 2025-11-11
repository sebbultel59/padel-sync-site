-- Migration: Cron job pour appeler dispatch-notifs périodiquement
-- Date: 2025-01-XX
-- Prérequis: L'extension pg_cron doit être activée dans Supabase

-- Fonction helper pour appeler l'Edge Function via HTTP
-- Note: Cette fonction nécessite l'extension pg_net ou http
CREATE OR REPLACE FUNCTION call_dispatch_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  function_url TEXT;
  response_status INT;
BEGIN
  -- Récupérer l'URL Supabase (à adapter selon votre configuration)
  -- En production, utilisez une variable d'environnement ou une table de config
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  -- Si pas configuré, on ne fait rien (l'appel sera fait via webhook ou manuellement)
  IF supabase_url IS NULL OR supabase_url = '' THEN
    RETURN;
  END IF;
  
  -- Construire l'URL de l'Edge Function
  function_url := supabase_url || '/functions/v1/dispatch-notifs';
  
  -- Appeler la fonction via HTTP (nécessite pg_net ou http extension)
  -- Note: Cette partie nécessite que l'extension soit activée
  -- Pour l'instant, on laisse vide car l'appel sera fait via webhook Supabase
  
  -- Alternative: utiliser SELECT net.http_post() si pg_net est activé
  -- SELECT net.http_post(
  --   url := function_url,
  --   headers := '{"Content-Type": "application/json"}'::jsonb
  -- );
END;
$$;

-- Créer un cron job qui appelle la fonction toutes les 30 secondes
-- Note: pg_cron doit être activé dans Supabase (généralement activé par défaut)
-- Pour activer: ALTER DATABASE postgres SET cron.enabled = true;

-- Supprimer le cron existant s'il existe
SELECT cron.unschedule('dispatch-notifications-job') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'dispatch-notifications-job'
);

-- Créer le cron job (appel toutes les 30 secondes)
-- Note: L'URL doit être remplacée par votre URL Supabase réelle
SELECT cron.schedule(
  'dispatch-notifications-job',
  '*/30 * * * * *', -- Toutes les 30 secondes
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/dispatch-notifs',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  );
  $$
);

-- Note importante: 
-- 1. Remplacez YOUR_PROJECT_REF par votre référence de projet Supabase
-- 2. Remplacez YOUR_ANON_KEY par votre clé anon Supabase (ou utilisez le service_role_key)
-- 3. L'extension pg_net doit être activée: CREATE EXTENSION IF NOT EXISTS pg_net;
-- 4. Alternative plus simple: Configurer un webhook dans le dashboard Supabase qui appelle
--    la fonction dispatch-notifs quand un INSERT est fait sur notification_jobs

