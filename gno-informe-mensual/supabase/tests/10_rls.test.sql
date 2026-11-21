-- RLS y permisos del módulo Entidad y Equity (0013).
\ir helpers.sql

do $$
declare
  t text;
  v_client uuid := pg_temp.mk_client('RLS Test Co');
  v_persona uuid := pg_temp.mk_persona(v_client, 'Persona Uno');
  v_owner uuid;
begin
  perform pg_temp.mk_profile(v_client, 'llc_single');
  perform pg_temp.mk_class(v_client, 'disregarded', '2020-01-01');
  v_owner := pg_temp.mk_owner(v_client, v_persona, 100, '2020-01-01', null, 'individual', false, 'member');
  insert into public.opening_balances (client_id, as_of, account_code, amount) values (v_client, '2025-12-31', '10100', 100);
  perform 1 from public.equity_provision_accounts(v_client, 'test');

  -- 1) RLS activo + policy de service_role en las 5 tablas
  foreach t in array array['entity_profile','tax_classification','owners','opening_balances','chart_accounts'] loop
    perform pg_temp.ok((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ': RLS activo');
    perform pg_temp.ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                                and policyname = 'service_role full access'), t || ': policy service_role');
    -- 2) anon y authenticated no tienen NINGÚN privilegio (revoke)
    perform pg_temp.ok(not has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete'), t || ': anon sin privilegios');
    perform pg_temp.ok(not has_table_privilege('authenticated', 'public.' || t, 'select,insert,update,delete'), t || ': authenticated sin privilegios');
    perform pg_temp.ok(pg_temp.as_role('anon', 'anon', format('select * from public.%I', t)) = '42501', t || ': anon no puede leer');
    perform pg_temp.ok(pg_temp.as_role('authenticated', 'authenticated', format('select * from public.%I', t)) = '42501', t || ': authenticated no puede leer');
    perform pg_temp.ok(pg_temp.as_role('anon', 'anon', format('delete from public.%I', t)) = '42501', t || ': anon no puede borrar');
  end loop;
  perform pg_temp.ok(pg_temp.as_role('anon', 'anon', 'select * from public.tax_classification_periods') = '42501', 'vista de periodos: anon sin acceso');

  -- 3) Funciones del módulo: solo service_role
  perform pg_temp.ok(pg_temp.as_role('anon', 'anon', format('select * from public.entity_validate(%L)', v_client)) = '42501', 'entity_validate: anon sin EXECUTE');
  perform pg_temp.ok(pg_temp.as_role('authenticated', 'authenticated', format('select * from public.equity_provision_accounts(%L)', v_client)) = '42501', 'equity_provision_accounts: authenticated sin EXECUTE');
  perform pg_temp.ok(pg_temp.as_role('authenticated', 'authenticated', format('select public.entity_complete_setup(%L)', v_client)) = '42501', 'entity_complete_setup: authenticated sin EXECUTE');
  perform pg_temp.ok(pg_temp.as_role('authenticated', 'authenticated', 'select * from public.equity_template(''s_corp'')') = '42501', 'equity_template: authenticated sin EXECUTE');
  perform pg_temp.ok(pg_temp.as_role('service_role', 'service_role', format('select * from public.entity_validate(%L)', v_client)) is null, 'entity_validate: service_role sí');

  -- 4) service_role lee y escribe
  perform pg_temp.ok(pg_temp.count_as('service_role', 'service_role', 'public.owners') >= 1, 'service_role lee owners');
  perform pg_temp.ok(pg_temp.as_role('service_role', 'service_role',
    format('update public.entity_profile set updated_by = ''svc'' where client_id = %L', v_client)) is null, 'service_role escribe entity_profile');

  -- 5) Defensa en profundidad: aunque a un rol se le diera GRANT por error, la POLICY sigue bloqueando
  foreach t in array array['entity_profile','tax_classification','owners','opening_balances','chart_accounts'] loop
    execute format('grant select, insert, update, delete on public.%I to policy_tester', t);
  end loop;
  perform pg_temp.ok(pg_temp.count_as('policy_tester', 'anon', 'public.owners') = 0, 'policy: claim anon ve 0 filas de owners');
  perform pg_temp.ok(pg_temp.count_as('policy_tester', 'authenticated', 'public.opening_balances') = 0, 'policy: claim authenticated ve 0 filas de opening_balances');
  perform pg_temp.ok(pg_temp.count_as('policy_tester', 'anon', 'public.entity_profile') = 0, 'policy: claim anon ve 0 filas de entity_profile');
  perform pg_temp.ok(pg_temp.as_role('policy_tester', 'anon',
    format('insert into public.opening_balances (client_id, as_of, account_code, amount) values (%L, ''2025-12-31'', ''10200'', 1)', v_client)) = '42501',
    'policy: claim anon no puede insertar saldos');
  perform pg_temp.ok(pg_temp.count_as('policy_tester', 'service_role', 'public.owners') = 1, 'policy: claim service_role ve owners');
  perform pg_temp.ok(pg_temp.as_role('policy_tester', 'service_role',
    format('insert into public.opening_balances (client_id, as_of, account_code, amount) values (%L, ''2025-12-31'', ''10200'', 1)', v_client)) is null,
    'policy: claim service_role inserta saldos');
  foreach t in array array['entity_profile','tax_classification','owners','opening_balances','chart_accounts'] loop
    execute format('revoke all on public.%I from policy_tester', t);
  end loop;
end $$;

-- 6) Los identificadores sensibles NO viven en estas tablas
do $$
begin
  perform pg_temp.ok(not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('entity_profile','tax_classification','owners','opening_balances','chart_accounts')
      and (column_name ~* '(ssn|itin|atin|tax_?id)' or (column_name ~* 'ein' and column_name <> 'ein_last4'))
  ), 'ninguna columna guarda SSN/ITIN/EIN (solo ein_last4)');
  perform pg_temp.ok((select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'owners' and column_name = 'persona_id') = 1, 'owners referencia a personas');
  perform pg_temp.ok(exists (
    select 1 from pg_constraint c where c.conrelid = 'public.owners'::regclass and c.contype = 'f'
      and c.confrelid = 'public.personas'::regclass), 'owners.persona_id tiene FK a personas');
end $$;

do $$
declare v_client uuid := pg_temp.mk_client('EIN Test Co');
begin
  perform pg_temp.mk_profile(v_client, 'llc_single');
  perform pg_temp.raises(format('update public.entity_profile set ein_last4 = ''123456789'' where client_id = %L', v_client), '23514', 'ein_last4 rechaza un EIN completo');
  perform pg_temp.raises(format('update public.entity_profile set ein_last4 = ''12-3'' where client_id = %L', v_client), '23514', 'ein_last4 exige 4 dígitos');
  update public.entity_profile set ein_last4 = '4321' where client_id = v_client;
  perform pg_temp.ok(true, 'ein_last4 acepta 4 dígitos');
  -- DLP: tampoco en texto libre de estas tablas
  perform pg_temp.raises(format('insert into public.tax_classification (client_id, classification, effective_date, election_doc) values (%L, ''disregarded'', ''2024-01-01'', ''carta 123-45-6789.pdf'')', v_client),
    '23514', 'DLP: SSN en election_doc');
  perform pg_temp.raises(format('insert into public.opening_balances (client_id, as_of, account_code, account_name, amount) values (%L, ''2025-12-31'', ''10100'', ''Cuenta 12-3456789'', 1)', v_client),
    '23514', 'DLP: EIN en account_name');
end $$;

-- 7) La bitácora registra los cambios y nunca copia datos sensibles
do $$
declare v_client uuid := pg_temp.mk_client('Log Test Co'); v_n bigint;
begin
  perform pg_temp.mk_profile(v_client, 'sole_prop');
  update public.entity_profile set ein_last4 = '9999', updated_by = 'tester@example.com' where client_id = v_client;
  select count(*) into v_n from public.change_log where tabla = 'entity_profile' and fila_id = v_client::text;
  perform pg_temp.ok(v_n >= 2, 'change_log registra INSERT y UPDATE de entity_profile');
  perform pg_temp.ok(exists (select 1 from public.change_log where tabla = 'entity_profile' and fila_id = v_client::text
                              and actor = 'tester@example.com' and cambios ? 'ein_last4'), 'change_log guarda actor y columna cambiada');
end $$;
