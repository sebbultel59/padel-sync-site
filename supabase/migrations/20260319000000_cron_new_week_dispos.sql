-- Cron: Nouvelle semaine (dimanche 20:00)
-- Crée des notification_jobs pour tous les membres d’au moins un groupe.
-- Prérequis: extensions pg_cron et pg_net (cohérent avec les autres crons)

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fonction serveur: insère les jobs (avec déduplication)
CREATE OR REPLACE FUNCTION create_new_week_dispos_notification_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notification_jobs (kind, recipients, payload, created_at)
  SELECT
    'new_week_dispos',
    ARRAY[gm.user_id],
    jsonb_build_object('message', 'Nouvelle semaine : Renseigne tes dispos'),
    NOW()
  FROM (
    SELECT DISTINCT user_id
    FROM group_members
  ) gm
  WHERE NOT EXISTS (
    SELECT 1
    FROM notification_jobs nj
    WHERE nj.kind = 'new_week_dispos'
      AND nj.created_at >= NOW() - INTERVAL '20 hours'
      AND nj.recipients @> ARRAY[gm.user_id]::uuid[]
  );
END;
$$;

-- Nettoyer si déjà présent
SELECT cron.unschedule('new-week-dispos-sun-20') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'new-week-dispos-sun-20'
);

-- Dimanche 20:00
SELECT cron.schedule(
  'new-week-dispos-sun-20',
  '0 20 * * 0',
  $$
    SELECT create_new_week_dispos_notification_jobs();
  $$
);

