-- Bulk RPCs for availability updates to reduce client round-trips

create or replace function set_availability_global_bulk(
  p_user uuid,
  p_starts timestamptz[],
  p_status text
)
returns void
language plpgsql
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_status not in ('available','neutral','busy') then
    raise exception 'Bad status %', p_status;
  end if;
  if p_user is null then
    raise exception 'Missing user';
  end if;
  if p_starts is null or array_length(p_starts, 1) is null then
    return;
  end if;

  foreach v_start in array p_starts loop
    v_end := v_start + interval '30 minutes';
    perform set_availability_global(p_user, v_start, v_end, p_status);
  end loop;
end$$;

create or replace function set_availability_group_bulk(
  p_user uuid,
  p_group uuid,
  p_starts timestamptz[],
  p_status text
)
returns void
language plpgsql
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_status not in ('available','neutral','busy') then
    raise exception 'Bad status %', p_status;
  end if;
  if p_user is null then
    raise exception 'Missing user';
  end if;
  if p_group is null then
    raise exception 'Missing group';
  end if;
  if p_starts is null or array_length(p_starts, 1) is null then
    return;
  end if;

  foreach v_start in array p_starts loop
    v_end := v_start + interval '30 minutes';
    perform set_availability_group(p_user, p_group, v_start, v_end, p_status);
  end loop;
end$$;

grant execute on function set_availability_global_bulk(uuid, timestamptz[], text) to authenticated;
grant execute on function set_availability_group_bulk(uuid, uuid, timestamptz[], text) to authenticated;
