-- Fonction RPC pour permettre aux membres d'un groupe de créer des disponibilités pour d'autres membres
-- Cette fonction contourne les restrictions RLS en vérifiant que l'utilisateur appelant et le membre cible sont tous deux membres du groupe

create or replace function set_availability_for_member(
  p_target_user uuid,  -- L'utilisateur pour qui on crée la disponibilité
  p_group uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_status text
)
returns void
language plpgsql
security definer  -- Permet de contourner les restrictions RLS
as $$
declare
  v_caller_id uuid;
  v_caller_is_member boolean;
  v_target_is_member boolean;
begin
  -- Récupérer l'ID de l'utilisateur appelant
  v_caller_id := auth.uid();
  
  if v_caller_id is null then
    raise exception 'Utilisateur non authentifié';
  end if;
  
  -- Vérifier que le statut est valide
  if p_status not in ('available','neutral','busy') then
    raise exception 'Bad status %', p_status;
  end if;
  
  -- Vérifier que l'utilisateur appelant est membre du groupe
  select exists(
    select 1 from group_members 
    where group_id = p_group and user_id = v_caller_id
  ) into v_caller_is_member;
  
  if not v_caller_is_member then
    raise exception 'Vous n''êtes pas membre de ce groupe';
  end if;
  
  -- Vérifier que l'utilisateur cible est membre du groupe
  select exists(
    select 1 from group_members 
    where group_id = p_group and user_id = p_target_user
  ) into v_target_is_member;
  
  if not v_target_is_member then
    raise exception 'L''utilisateur cible n''est pas membre de ce groupe';
  end if;
  
  -- Créer ou mettre à jour la disponibilité
  insert into availability(user_id, group_id, start, "end", status)
  values (p_target_user, p_group, p_start, p_end, p_status)
  on conflict (user_id, group_id, start, "end") 
  do update set status = excluded.status;
end$$;

