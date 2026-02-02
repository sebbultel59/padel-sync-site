-- Cron: Rappels dispo (dimanche 19:30 + jeudi 19:00 Europe/Paris)
-- Prérequis: extensions pg_cron et pg_net

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Nettoyer si déjà présent
SELECT cron.unschedule('availability-reminder-sun') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'availability-reminder-sun'
);
SELECT cron.unschedule('availability-reminder-thu') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'availability-reminder-thu'
);

-- Dimanche 19:30
SELECT cron.schedule(
  'availability-reminder-sun',
  '30 19 * * 0',
  $$
    SELECT
      net.http_post(
        url := 'https://iieiggyqcncbkjwsdcxl.supabase.co/functions/v1/push-availability-reminders',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
  $$
);

-- Jeudi 19:00
SELECT cron.schedule(
  'availability-reminder-thu',
  '0 19 * * 4',
  $$
    SELECT
      net.http_post(
        url := 'https://iieiggyqcncbkjwsdcxl.supabase.co/functions/v1/push-availability-reminders',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
  $$
);
