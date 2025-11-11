-- Migration: Appel automatique de dispatch-notifs quand un notification_job est créé
-- Date: 2025-01-XX
-- Prérequis: L'extension pg_net doit être activée dans Supabase

-- Activer l'extension pg_net si elle n'est pas déjà activée
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fonction qui appelle l'Edge Function dispatch-notifs via HTTP
CREATE OR REPLACE FUNCTION trigger_call_dispatch_notifications()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT := 'https://iieiggyqcncbkjwsdcxl.supabase.co';
  function_url TEXT;
  anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZWlnZ3lxY25jYmtqd3NkY3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNjk3MzQsImV4cCI6MjA3Mjg0NTczNH0.tTCN1140MVgNswkq5HSXzC3fS0Uuylb-5ZP6h1vTWMI';
BEGIN
  -- Construire l'URL de l'Edge Function
  function_url := supabase_url || '/functions/v1/dispatch-notifs';
  
  -- Appeler la fonction via HTTP (asynchrone, ne bloque pas l'INSERT)
  -- Note: net.http_post est asynchrone, donc l'INSERT ne sera pas ralenti
  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := '{}'::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Créer le trigger
DROP TRIGGER IF EXISTS notification_jobs_auto_dispatch_trigger ON notification_jobs;
CREATE TRIGGER notification_jobs_auto_dispatch_trigger
  AFTER INSERT ON notification_jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_call_dispatch_notifications();

-- Note importante:
-- Les valeurs (URL et clé) sont maintenant en dur dans la fonction pour éviter les problèmes de permissions.
-- 
-- Alternative plus simple (recommandée):
-- Configurer un webhook dans le dashboard Supabase (Database > Webhooks) qui appelle
-- https://iieiggyqcncbkjwsdcxl.supabase.co/functions/v1/dispatch-notifs
-- quand un INSERT est fait sur notification_jobs
-- 
-- Avantages du webhook:
-- - Pas besoin d'activer pg_net
-- - Pas de valeurs en dur dans le code
-- - Plus facile à maintenir
-- - Fonctionne même si le trigger échoue

