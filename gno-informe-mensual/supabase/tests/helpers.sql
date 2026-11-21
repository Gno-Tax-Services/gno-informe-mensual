-- Ayudas compartidas (se incluyen con \ir). Todo vive en pg_temp: nada queda en la base.
set client_min_messages = notice;

create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLÓ: %', label; end if;
  raise notice 'PASS %', label;
end $$;

-- Ejecuta p_sql y exige que falle con SQLSTATE p_state.
create or replace function pg_temp.raises(p_sql text, p_state text, label text) returns void language plpgsql as $$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = p_state then raise notice 'PASS %', label; return; end if;
    raise exception 'FALLÓ: % — esperaba %, obtuvo % (%)', label, p_state, v_state, sqlerrm;
  end;
  raise exception 'FALLÓ: % — no falló', label;
end $$;

-- Ejecuta p_sql como un rol de Supabase; devuelve el SQLSTATE o null si funcionó.
create or replace function pg_temp.as_role(p_role text, p_claim text, p_sql text) returns text language plpgsql as $$
declare v_state text;
begin
  perform set_config('request.jwt.claim.role', coalesce(p_claim, ''), true);
  begin
    execute format('set local role %I', p_role);
    execute p_sql;
    v_state := null;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claim.role', '', true);
  return v_state;
end $$;

-- Cuenta filas que ve un rol (falla si el rol no puede ni consultar).
create or replace function pg_temp.count_as(p_role text, p_claim text, p_table text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.role', coalesce(p_claim, ''), true);
  execute format('set local role %I', p_role);
  execute format('select count(*) from %s', p_table) into n;
  reset role;
  perform set_config('request.jwt.claim.role', '', true);
  return n;
end $$;

create or replace function pg_temp.mk_client(p_name text) returns uuid language sql as $$
  insert into public.clients (nombre_dueno, nombre_compania, email)
  values ('Dueño de prueba', p_name, replace(lower(p_name), ' ', '') || '@example.com') returning id $$;

create or replace function pg_temp.mk_persona(p_client uuid, p_name text) returns uuid language sql as $$
  insert into public.personas (client_id, nombre, rol) values (p_client, p_name, 'owner') returning id $$;

create or replace function pg_temp.mk_profile(p_client uuid, p_form text) returns void language sql as $$
  insert into public.entity_profile (client_id, legal_form, formation_date) values (p_client, p_form, '2020-01-01') $$;

create or replace function pg_temp.mk_class(p_client uuid, p_cls text, p_date date, p_election text default 'none') returns uuid language sql as $$
  insert into public.tax_classification (client_id, classification, effective_date, election_form)
  values (p_client, p_cls, p_date, p_election) returning id $$;

create or replace function pg_temp.mk_owner(
  p_client uuid, p_persona uuid, p_pct numeric, p_start date default '2020-01-01', p_end date default null,
  p_type text default 'individual', p_officer boolean default false, p_role text default 'partner') returns uuid language sql as $$
  insert into public.owners (client_id, persona_id, role, holder_type, ownership_pct, start_date, end_date, is_officer)
  values (p_client, p_persona, p_role, p_type, p_pct, p_start, p_end, p_officer) returning id $$;

-- Códigos de entity_validate de una severidad, ordenados
create or replace function pg_temp.codes(p_client uuid, p_sev text default 'error') returns text[] language sql as $$
  select coalesce(array_agg(code order by code), '{}') from public.entity_validate(p_client) where severity = p_sev $$;
