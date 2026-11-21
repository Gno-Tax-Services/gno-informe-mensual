-- Simula lo mínimo de Supabase en un Postgres vacío: roles y auth.role().
-- SOLO para pruebas locales/CI; no es una migración.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  -- Rol sin BYPASSRLS que se comporta como service_role solo por el claim:
  -- permite probar que la POLICY (y no solo el bypass) deja pasar al servidor.
  if not exists (select 1 from pg_roles where rolname = 'policy_tester') then create role policy_tester nologin; end if;
end $$;

create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;
grant usage on schema auth to anon, authenticated, service_role, policy_tester;
grant usage on schema public to anon, authenticated, service_role, policy_tester;

-- Igual que Supabase: lo que se crea en public queda accesible a todos los roles
-- por defecto. Por eso las migraciones hacen REVOKE; las pruebas verifican que funcione.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
