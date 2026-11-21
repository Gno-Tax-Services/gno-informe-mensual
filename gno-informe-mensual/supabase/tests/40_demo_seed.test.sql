-- La semilla DEMO carga limpia, es idempotente, y todo es ficticio (casos 2 a 5 de la spec).
\ir helpers.sql
\ir ../seed/demo.sql
\ir ../seed/demo.sql

do $$
declare
  v_sole uuid := 'd0000000-0000-4000-8000-000000000007';
  v_llc  uuid := 'd0000000-0000-4000-8000-000000000008';
  v_s    uuid := 'd0000000-0000-4000-8000-000000000009';
  v_part uuid := 'd0000000-0000-4000-8000-000000000010';
  c uuid;
begin
  foreach c in array array[v_sole, v_llc, v_s, v_part] loop
    perform pg_temp.ok(pg_temp.codes(c) = '{}', 'demo ' || right(c::text, 2) || ': sin errores de validación');
    perform pg_temp.ok(public.entity_statements_ready(c), 'demo ' || right(c::text, 2) || ': puede procesar statements');
    perform pg_temp.ok((select setup_completed_at is not null from public.entity_profile where client_id = c), 'demo ' || right(c::text, 2) || ': alta confirmada');
    perform pg_temp.ok((select balanced from public.opening_balance_check(c)), 'demo ' || right(c::text, 2) || ': saldos cuadran');
  end loop;
  perform pg_temp.ok((select count(*) from public.chart_accounts where client_id = v_sole) = 3, 'caso 2: 3 cuentas de Equity');
  perform pg_temp.ok((select count(*) from public.chart_accounts where client_id = v_llc and closed_on = '2025-12-31') = 3
                     and (select count(*) from public.chart_accounts where client_id = v_llc and closed_on is null) = 5, 'caso 3: plantilla disregarded cerrada el 31/12/2025 y S-corp abierta');
  perform pg_temp.ok((select count(*) from public.chart_accounts where client_id = v_s) = 7, 'caso 4: 7 cuentas S-corp (60/40)');
  perform pg_temp.ok((select count(*) from public.chart_accounts where client_id = v_part and role = 'partner_capital') = 2, 'caso 5: una cuenta de capital por socio pese al cambio de %');
  perform pg_temp.ok((select count(*) from public.entity_alerts(v_llc, 2026) where code = 'S_CORP_OFFICER_NO_PAYROLL') = 1, 'caso 3: alerta de sueldo razonable (sin nómina)');
  perform pg_temp.ok((select count(*) from public.entity_alerts(v_s, 2026)) = 0, 'caso 4: con nómina en 2026 no hay alerta de sueldo razonable');
  perform pg_temp.ok((select count(*) from public.owners where client_id = v_part) = 4, 'caso 5: cuatro tramos de participación');

  -- Nada real: correos ficticios y ningún identificador en claro
  perform pg_temp.ok(not exists (select 1 from public.clients where id::text like 'd0000000%' and email not like '%@example.com'), 'clientes demo con correos @example.com');
  perform pg_temp.ok(not exists (select 1 from public.entity_profile e join public.clients cl on cl.id = e.client_id
      where cl.id::text like 'd0000000%' and (e.ein_last4 !~ '^[0-9]{4}$')), 'EIN solo últimos 4');
  perform pg_temp.ok(not exists (select 1 from public.identificadores i where i.client_id::text like 'd0000000%' and i.valor_enc !~ '^v1\.REVNTw'), 'identificadores demo son marcadores, no valores reales');
end $$;

-- Idempotente: correr la semilla dos veces no duplica nada
do $$
begin
  perform pg_temp.ok((select count(*) from public.owners where client_id::text like 'd0000000%') = 8, 'semilla idempotente (8 filas de dueños: 1 + 1 + 2 + 4)');
  perform pg_temp.ok((select count(*) from public.opening_balances where client_id::text like 'd0000000%') = 10, 'semilla idempotente (10 saldos iniciales)');
  perform pg_temp.ok((select count(*) from public.chart_accounts where client_id = 'd0000000-0000-4000-8000-000000000007') = 3, 'semilla idempotente (cuentas sin duplicar)');
end $$;
