-- Migration: Cron job pour appeler push-reminders périodiquement
-- Date: 2025-01-XX
-- Prérequis: Les extensions pg_cron et pg_net doivent être activées dans Supabase

-- Activer les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Supprimer le cron existant s'il existe
SELECT cron.unschedule('push-reminders-job') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'push-reminders-job'
);

-- Créer le cron job (appel toutes les 5 minutes)
-- Note: La documentation indique que push-reminders doit être appelé toutes les 5 minutes
-- pour vérifier les matches à rappeler (J-24h et J-2h)
SELECT cron.schedule(
  'push-reminders-job',
  '*/5 * * * *', -- Toutes les 5 minutes (format cron standard: minute heure jour mois jour-semaine)
  $$
  SELECT net.http_post(
    url := 'https://iieiggyqcncbkjwsdcxl.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZWlnZ3lxY25jYmtqd3NkY3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNjk3MzQsImV4cCI6MjA3Mjg0NTczNH0.tTCN1140MVgNswkq5HSXzC3fS0Uuylb-5ZP6h1vTWMI'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Note importante: 
-- 1. Le cron job appelle push-reminders toutes les 5 minutes
-- 2. La fonction push-reminders vérifie les matches confirmés qui doivent être rappelés
--    (24h avant et 2h avant le début du match)
-- 3. La fenêtre de détection est de ±5 minutes autour de J-24h et J-2h
-- 4. Les matches sont marqués avec reminder_24_sent_at et reminder_2h_sent_at pour éviter les doublons









