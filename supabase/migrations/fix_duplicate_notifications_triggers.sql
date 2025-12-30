-- Migration: Correction des doublons de notifications
-- Date: 2025-01-XX
-- Description: Ajoute une protection contre les doublons dans les triggers de notifications

-- Cette migration met à jour les fonctions trigger pour éviter les notifications en double
-- Elle vérifie qu'une notification similaire n'a pas été créée dans les 5 dernières minutes

-- ============================================================================
-- 1. CORRECTION: notify_badge_unlocked
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_badge_unlocked()
RETURNS TRIGGER AS $$
DECLARE
  v_badge_label TEXT;
BEGIN
  -- Protection contre les doublons : vérifier qu'une notification n'existe pas déjà
  IF EXISTS (
    SELECT 1 FROM notification_jobs 
    WHERE kind = 'badge_unlocked' 
    AND actor_id = NEW.user_id
    AND payload->>'message' LIKE '%' || COALESCE((SELECT label FROM badge_definitions WHERE id = NEW.badge_id), 'badge') || '%'
    AND created_at >= NOW() - INTERVAL '5 minutes'
  ) THEN
    RAISE NOTICE '[notify_badge_unlocked] ⚠️ Notification déjà créée récemment pour badge %, utilisateur %, ignoré', NEW.badge_id, NEW.user_id;
    RETURN NEW;
  END IF;
  
  -- Récupérer le label du badge
  SELECT label INTO v_badge_label
  FROM badge_definitions
  WHERE id = NEW.badge_id;
  
  -- Créer la notification pour l'utilisateur qui a débloqué le badge
  INSERT INTO notification_jobs (
    kind,
    actor_id,
    recipients,
    payload,
    created_at
  ) VALUES (
    'badge_unlocked',
    NEW.user_id,
    ARRAY[NEW.user_id],
    jsonb_build_object('message', COALESCE(v_badge_label, 'Nouveau badge') || ' débloqué !'),
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. CORRECTION: notify_match_result_recorded
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_match_result_recorded()
RETURNS TRIGGER AS $$
DECLARE
  v_match_id UUID;
  v_score_text TEXT;
  v_player_ids UUID[];
  v_group_id UUID;
BEGIN
  -- Ne notifier que si le statut est 'completed'
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;
  
  -- Récupérer les informations du match
  SELECT m.id, m.group_id INTO v_match_id, v_group_id
  FROM matches m
  WHERE m.id = NEW.match_id;
  
  IF v_match_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  v_score_text := COALESCE(NEW.score_text, 'Résultat enregistré');
  
  -- Récupérer les IDs des 4 joueurs du match directement depuis NEW
  SELECT ARRAY_AGG(DISTINCT player_id)
  INTO v_player_ids
  FROM (
    SELECT NEW.team1_player1_id as player_id WHERE NEW.team1_player1_id IS NOT NULL
    UNION
    SELECT NEW.team1_player2_id WHERE NEW.team1_player2_id IS NOT NULL
    UNION
    SELECT NEW.team2_player1_id WHERE NEW.team2_player1_id IS NOT NULL
    UNION
    SELECT NEW.team2_player2_id WHERE NEW.team2_player2_id IS NOT NULL
  ) players;
  
  -- Si aucun joueur trouvé, ne pas créer de notification
  IF v_player_ids IS NULL OR array_length(v_player_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;
  
  -- Protection contre les doublons : vérifier qu'une notification n'existe pas déjà pour ce match
  IF EXISTS (
    SELECT 1 FROM notification_jobs 
    WHERE kind = 'match_result_recorded' 
    AND match_id = v_match_id
    AND created_at >= NOW() - INTERVAL '5 minutes'
  ) THEN
    RAISE NOTICE '[notify_match_result_recorded] ⚠️ Notification déjà créée récemment pour match %, ignoré', v_match_id;
    RETURN NEW;
  END IF;
  
  -- Créer une notification pour chaque joueur
  INSERT INTO notification_jobs (
    kind,
    actor_id,
    recipients,
    match_id,
    group_id,
    payload,
    created_at
  )
  SELECT
    'match_result_recorded',
    player_id,
    ARRAY[player_id],
    v_match_id,
    v_group_id,
    jsonb_build_object('message', 'Le résultat du match a été enregistré : ' || v_score_text),
    NOW()
  FROM unnest(v_player_ids) AS player_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. CORRECTION: notify_group_join_request
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_group_join_request()
RETURNS TRIGGER AS $$
DECLARE
  v_group_name TEXT;
  v_notification_kind TEXT;
  v_notification_body TEXT;
BEGIN
  -- Ne notifier que si le statut change vers 'approved' ou 'rejected'
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  
  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;
  
  -- Récupérer le nom du groupe
  SELECT name INTO v_group_name
  FROM groups
  WHERE id = NEW.group_id;
  
  -- Déterminer le type de notification
  IF NEW.status = 'approved' THEN
    v_notification_kind := 'group_join_request_approved';
    v_notification_body := 'Ta demande pour rejoindre "' || COALESCE(v_group_name, 'le groupe') || '" a été acceptée';
  ELSIF NEW.status = 'rejected' THEN
    v_notification_kind := 'group_join_request_rejected';
    v_notification_body := 'Ta demande pour rejoindre "' || COALESCE(v_group_name, 'le groupe') || '" a été refusée';
  END IF;
  
  -- Protection contre les doublons : vérifier qu'une notification n'existe pas déjà pour cette demande
  IF EXISTS (
    SELECT 1 FROM notification_jobs 
    WHERE kind = v_notification_kind
    AND actor_id = NEW.user_id
    AND group_id = NEW.group_id
    AND created_at >= NOW() - INTERVAL '5 minutes'
  ) THEN
    RAISE NOTICE '[notify_group_join_request] ⚠️ Notification déjà créée récemment pour demande %, utilisateur %, ignoré', NEW.id, NEW.user_id;
    RETURN NEW;
  END IF;
  
  -- Créer la notification pour l'utilisateur qui a fait la demande
  INSERT INTO notification_jobs (
    kind,
    actor_id,
    recipients,
    group_id,
    payload,
    created_at
  ) VALUES (
    v_notification_kind,
    NEW.user_id,
    ARRAY[NEW.user_id],
    NEW.group_id,
    jsonb_build_object('message', v_notification_body),
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Commentaires
-- ============================================================================

COMMENT ON FUNCTION notify_badge_unlocked() IS 
  'Crée une notification quand un badge est débloqué par un joueur (avec protection contre les doublons)';

COMMENT ON FUNCTION notify_match_result_recorded() IS 
  'Crée une notification pour tous les joueurs quand un résultat de match est enregistré (avec protection contre les doublons)';

COMMENT ON FUNCTION notify_group_join_request() IS 
  'Crée une notification quand une demande de rejoindre un groupe est approuvée ou rejetée (avec protection contre les doublons)';







