-- Cron: rappel toutes les 48h si aucune dispo n'est renseignée dans aucun groupe
-- Stratégie: exécuter régulièrement et dédupliquer côté fonction (48h par utilisateur)
-- Prérequis: extensions pg_cron et pg_net

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Nettoyer si déjà présent
SELECT cron.unschedule('missing-availabilities-48h') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'missing-availabilities-48h'
);

-- Toutes les 6 heures (la déduplication 48h est appliquée dans la fonction)
SELECT cron.schedule(
  'missing-availabilities-48h',
  '0 */6 * * *',
  $$
    SELECT
      net.http_post(
        url := 'https://iieiggyqcncbkjwsdcxl.supabase.co/functions/v1/push-missing-availabilities',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
  $$
);

