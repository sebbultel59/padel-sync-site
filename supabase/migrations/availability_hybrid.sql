-- Modèle hybride disponibilités: global + exceptions par groupe

-- 1) Table globale (source de vérité par défaut)
create table if not exists availability_global (
  user_id uuid not null references profiles(id) on delete cascade,
  start timestamptz not null,
  "end"   timestamptz not null,
  status text not null check (status in ('available','neutral','busy')),
  primary key (user_id, start, "end")
);
create index if not exists idx_avail_global_user_time on availability_global(user_id, start, "end");

-- 2) Table exceptions par groupe: on conserve votre table availability existante
-- Assumée: availability(user_id uuid, group_id uuid, start timestamptz, end timestamptz, status text)
-- Ajout de contraintes conseillées si absentes
do $$ begin
  perform 1 from information_schema.table_constraints where table_name='availability' and constraint_name='availability_status_check';
  if not found then
    alter table availability add constraint availability_status_check check (status in ('available','neutral','busy'));
  end if;
exception when others then null; end $$;
create index if not exists idx_avail_group_user_time on availability(user_id, group_id, start, "end");

-- 3) Vue des disponibilités effectives par groupe
create or replace view availability_effective as
-- Inclure les exceptions par groupe (mais exclure celles avec status='neutral' qui servent seulement à masquer)
select a.user_id,
       a.group_id,
       a.start,
       a."end",
       a.status
from availability a
where a.status != 'neutral' -- exclure les exceptions 'neutral' qui servent seulement à masquer
union all
-- Inclure les disponibilités globales seulement s'il n'y a pas d'exception (y compris 'neutral') pour ce groupe
select g.user_id,
       gm.group_id,
       g.start,
       g."end",
       g.status
from availability_global g
join group_members gm on gm.user_id = g.user_id
left join availability ex
  on ex.user_id = g.user_id
 and ex.group_id = gm.group_id
 and ex.start = g.start
 and ex."end"   = g."end"
where ex.user_id is null; -- inclure seulement s'il n'y a pas d'exception (les exceptions 'neutral' masquent aussi)

-- 4) RPC: set_availability_global
create or replace function set_availability_global(p_user uuid, p_start timestamptz, p_end timestamptz, p_status text)
returns void language plpgsql as $$
begin
  if p_status not in ('available','neutral','busy') then
    raise exception 'Bad status %', p_status;
  end if;
  
  -- Si status = 'neutral', supprimer au lieu d'insérer/mettre à jour
  if p_status = 'neutral' then
    delete from availability_global
    where user_id = p_user
      and start = p_start
      and "end" = p_end;
    -- Aussi supprimer les exceptions correspondantes
    delete from availability
    where user_id = p_user
      and start = p_start
      and "end" = p_end;
    return;
  end if;
  
  -- Sinon, insérer ou mettre à jour
  insert into availability_global(user_id,start,"end",status)
  values (p_user, p_start, p_end, p_status)
  on conflict (user_id,start,"end") do update set status = excluded.status;
  -- supprimer exceptions identiques pour éviter les doublons visuels
  delete from availability
   where user_id = p_user
     and start = p_start
     and "end" = p_end
     and status = p_status; -- on garde les exceptions quand elles diffèrent
end$$;

-- 5) RPC: set_availability_group (exception par groupe)
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

-- 6) RPC: get_availability_effective (fenêtrée)
create or replace function get_availability_effective(p_group uuid, p_user uuid, p_low timestamptz, p_high timestamptz)
returns table(user_id uuid, group_id uuid, start timestamptz, "end" timestamptz, status text)
language sql as $$
  select user_id, group_id, start, "end", status
  from availability_effective
  where group_id = p_group
    and (p_user is null or user_id = p_user)
    and start >= p_low and start <= p_high
  order by user_id, start
$$;


