-- Migration pour corriger le bug des créneaux qui réapparaissent automatiquement
-- Problème: Les créneaux supprimés réapparaissaient après changement de semaine
-- Solution: Améliorer la fonction set_availability_group pour mieux gérer les exceptions 'neutral'

-- Mettre à jour la fonction set_availability_group pour mieux gérer la suppression
create or replace function set_availability_group(p_user uuid, p_group uuid, p_start timestamptz, p_end timestamptz, p_status text)
returns void language plpgsql as $$
declare
  v_has_global boolean;
begin
  if p_status not in ('available','neutral','busy') then
    raise exception 'Bad status %', p_status;
  end if;
  
  -- Si status = 'neutral', créer une exception "neutral" pour masquer la disponibilité globale
  -- au lieu de simplement supprimer l'exception (qui ferait réapparaître la disponibilité globale)
  if p_status = 'neutral' then
    -- Vérifier si une disponibilité globale existe pour ce créneau
    select exists (
      select 1 from availability_global
      where user_id = p_user
        and start = p_start
        and "end" = p_end
    ) into v_has_global;
    
    if v_has_global then
      -- Si une disponibilité globale existe, créer/forcer une exception "neutral" pour la masquer
      -- dans ce groupe spécifique (même si une exception existe déjà avec un autre statut)
      insert into availability(user_id,group_id,start,"end",status)
      values (p_user, p_group, p_start, p_end, 'neutral')
      on conflict (user_id,group_id,start,"end") do update set status = 'neutral';
    else
      -- Sinon, supprimer l'exception si elle existe (pas de globale à masquer)
      delete from availability
      where user_id = p_user
        and group_id = p_group
        and start = p_start
        and "end" = p_end;
    end if;
    return;
  end if;
  
  -- Sinon, insérer ou mettre à jour
  -- Si on crée une disponibilité 'available' et qu'une exception 'neutral' existe,
  -- on la remplace par 'available' (cela masquera la globale si elle existe)
  insert into availability(user_id,group_id,start,"end",status)
  values (p_user, p_group, p_start, p_end, p_status)
  on conflict (user_id,group_id,start,"end") do update set status = excluded.status;
end$$;

