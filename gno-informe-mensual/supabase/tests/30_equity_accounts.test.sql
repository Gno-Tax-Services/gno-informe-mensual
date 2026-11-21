-- Plantillas de Equity, creación de cuentas, cambio de clasificación, alta completa,
-- alertas y guardado atómico. Incluye los casos 2 a 5 de la spec.
\ir helpers.sql

create or replace function pg_temp.accts(p_client uuid, p_open_only boolean default true) returns text[] language sql as $$
  select coalesce(array_agg(code || ' ' || name_en order by opened_on, code), '{}')
  from public.chart_accounts where client_id = p_client and (not p_open_only or closed_on is null) $$;

-- ── Plantillas (tabla de la spec) ──
do $$
begin
  perform pg_temp.ok((select array_agg(code || ':' || per_owner::text order by code) from public.equity_template('disregarded'))
    = array['30000:false','30500:false','30700:false'], 'plantilla disregarded: 30000/30500/30700, sin cuentas por dueño');
  perform pg_temp.ok((select array_agg(code || ':' || per_owner::text order by code) from public.equity_template('partnership'))
    = array['30100:true','30500:true','30700:true'], 'plantilla partnership: 30100/30500/30700, todas por dueño');
  perform pg_temp.ok((select array_agg(code || ':' || per_owner::text order by code) from public.equity_template('s_corp'))
    = array['25000:true','31000:false','31500:false','32000:false','33000:true'], 'plantilla S-corp: 31000/31500/32000 + 33000 y 25000 por dueño');
  perform pg_temp.ok((select array_agg(code || ':' || per_owner::text order by code) from public.equity_template('c_corp'))
    = array['25000:true','31000:false','31500:false','32000:false','34000:true'], 'plantilla C-corp: 31000/31500/32000 + 34000 y 25000 por dueño');
  perform pg_temp.ok((select name_en from public.equity_template('disregarded') where code = '30700') = 'Owner''s Draws', 'disregarded → "Draws"');
  perform pg_temp.ok((select name_en from public.equity_template('partnership') where code = '30700') = 'Partner Distributions', 'partnership → "Distributions"');
  perform pg_temp.ok((select name_en from public.equity_template('s_corp') where code = '33000') = 'Shareholder Distributions', 'S-corp → "Distributions"');
  perform pg_temp.ok((select name_en from public.equity_template('c_corp') where code = '34000') = 'Dividends Paid', 'C-corp → "Dividends"');
  perform pg_temp.ok((select name_es from public.equity_template('c_corp') where code = '34000') = 'Dividendos pagados', 'etiquetas en español');
  perform pg_temp.ok(not exists (select 1 from public.equity_template('disregarded') where code = '32000'), 'disregarded no tiene Retained Earnings');
  perform pg_temp.ok((select count(*) from public.equity_template('nada')) = 0, 'clasificación desconocida → sin plantilla');
  -- el rol por código es coherente con cada plantilla
  perform pg_temp.ok(not exists (
    select 1 from (select c, (public.equity_template(c)).* from unnest(array['disregarded','partnership','s_corp','c_corp']) c) x
    where public.equity_code_role(x.code) is distinct from x.role), 'equity_code_role concuerda con el rol de cada cuenta de las plantillas');
  perform pg_temp.ok(public.equity_code_role('30101') = 'partner_capital' and public.equity_code_role('33001') = 'distributions'
                     and public.equity_code_role('25001') = 'shareholder_loans', 'códigos por dueño (30101, 33001, 25001) conservan su rol');
end $$;

-- ── Caso 1 (estructura del piloto): partnership 50/50, una cuenta por socio ──
do $$
declare v uuid := pg_temp.mk_client('Piloto partnership'); a uuid; b uuid;
begin
  perform pg_temp.mk_profile(v, 'llc_multi'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  a := pg_temp.mk_persona(v, 'Socio A'); b := pg_temp.mk_persona(v, 'Socio B');
  perform pg_temp.mk_owner(v, a, 50); perform pg_temp.mk_owner(v, b, 50);
  perform 1 from public.equity_provision_accounts(v, 'test');
  perform pg_temp.ok(pg_temp.accts(v) = array[
    '30100 Partner Capital – Socio A','30101 Partner Capital – Socio B',
    '30500 Partner Contributions – Socio A','30501 Partner Contributions – Socio B',
    '30700 Partner Distributions – Socio A','30701 Partner Distributions – Socio B'], 'partnership: 30100 Capital – Socio A y 30101 Capital – Socio B (ejemplo de la spec)');
  perform pg_temp.ok((select name_es from public.chart_accounts where client_id = v and code = '30101') = 'Capital del socio – Socio B', 'nombre en español por dueño');
  -- Idempotencia
  perform pg_temp.ok((select count(*) from public.equity_provision_accounts(v, 'test') where created) = 0, 'segunda corrida no crea nada');
  perform pg_temp.ok((select count(*) from public.chart_accounts where client_id = v) = 6, 'siguen 6 cuentas');
  -- Un dueño nuevo recibe sus cuentas
  update public.owners set ownership_pct = 40 where client_id = v;
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'Tercero'), 20, '2020-01-01');
  perform 1 from public.equity_provision_accounts(v, 'test');
  perform pg_temp.ok((select count(*) from public.chart_accounts where client_id = v) = 9
    and exists (select 1 from public.chart_accounts where client_id = v and code = '30102' and name_en = 'Partner Capital – Tercero'), 'dueño nuevo → 30102 Capital – Tercero');
end $$;

-- ── Caso 2: sole proprietor ──
do $$
declare v uuid := pg_temp.mk_client('Caso2 sole'); 
begin
  perform pg_temp.mk_profile(v, 'sole_prop'); perform pg_temp.mk_class(v, 'disregarded', '2020-01-01');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'Dueña Única'), 100, '2020-01-01', null, 'individual', false, 'owner');
  perform 1 from public.equity_provision_accounts(v, 'test');
  perform pg_temp.ok(pg_temp.accts(v) = array['30000 Owner''s Capital','30500 Owner''s Contributions','30700 Owner''s Draws'], 'caso 2: tres cuentas, ninguna por dueño');
end $$;

-- ── Caso 3: LLC un miembro que elige S-corp el 01/01 (capital previo $20,000) ──
do $$
declare v uuid := pg_temp.mk_client('Caso3 LLC a S-corp'); o uuid; d_old uuid; d_new uuid;
begin
  perform pg_temp.mk_profile(v, 'llc_single');
  d_old := pg_temp.mk_class(v, 'disregarded', '2024-01-01');
  d_new := pg_temp.mk_class(v, 's_corp', '2026-01-01', '2553');
  o := pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'Miembro Único'), 100, '2024-01-01', null, 'individual', true, 'member');
  insert into public.opening_balances (client_id, as_of, account_code, account_name, amount) values
    (v, '2025-12-31', '10100', 'Banco', 20000), (v, '2025-12-31', '30000', 'Owner''s Capital', 20000);
  perform pg_temp.ok(pg_temp.codes(v) = '{}', 'caso 3: saldos al 31/12/2025 (capital $20,000 en la plantilla disregarded) válidos');
  perform 1 from public.equity_provision_accounts(v, 'test');
  perform pg_temp.ok((select closed_on from public.chart_accounts where client_id = v and code = '30000') = '2025-12-31', 'caso 3: cuentas disregarded cerradas el día previo (31/12/2025)');
  perform pg_temp.ok((select bool_and(closed_on = '2025-12-31') from public.chart_accounts where classification_id = d_old), 'caso 3: todas las cuentas de la plantilla anterior cerradas');
  perform pg_temp.ok(pg_temp.accts(v) = array['25000 Loans from Shareholders – Miembro Único','31000 Common Stock','31500 Additional Paid-in Capital',
      '32000 Retained Earnings / AAA','33000 Shareholder Distributions – Miembro Único'], 'caso 3: plantilla S-corp abierta desde el 01/01');
  perform pg_temp.ok((select min(opened_on) from public.chart_accounts where classification_id = d_new) = '2026-01-01', 'caso 3: cuentas S-corp abren el 01/01/2026');
  -- Alerta de sueldo razonable si no hay nómina
  perform pg_temp.ok((select count(*) from public.entity_alerts(v, 2026) where code = 'S_CORP_OFFICER_NO_PAYROLL') = 1, 'caso 3: sin nómina en 2026 → alerta de sueldo razonable');
  perform pg_temp.ok((select count(*) from public.entity_alerts(v, 2025)) = 0, 'caso 3: en 2025 (disregarded) no aplica la alerta');
  insert into public.payroll_quarters (client_id, anio, trimestre, salarios) values (v, 2026, 3, 36000);
  perform pg_temp.ok((select count(*) from public.entity_alerts(v, 2026) where code = 'S_CORP_OFFICER_NO_PAYROLL') = 0, 'caso 3: con sueldo en nómina la alerta desaparece');
  -- El saldo de capital no se reparte solo: no hay ningún asiento ni movimiento de saldos
  perform pg_temp.ok((select amount from public.opening_balances where client_id = v and account_code = '30000') = 20000, 'caso 3: el capital previo no se mueve automáticamente a Common Stock/APIC');
  -- Cambiar el tipo de una elección regenera sus cuentas
  update public.tax_classification set classification = 'c_corp', election_form = '8832' where id = d_new;
  perform pg_temp.ok((select count(*) from public.chart_accounts where classification_id = d_new) = 0, 'cambiar la elección borra sus cuentas para regenerarlas');
  perform 1 from public.equity_provision_accounts(v, 'test');
  perform pg_temp.ok('34000 Dividends Paid – Miembro Único' = any (pg_temp.accts(v)), 'tras regenerar, la plantilla C-corp usa Dividends');
end $$;

-- ── Caso 4: S-corp 60/40 ──
do $$
declare v uuid := pg_temp.mk_client('Caso4 S-corp'); 
begin
  perform pg_temp.mk_profile(v, 'corporation'); perform pg_temp.mk_class(v, 's_corp', '2020-01-01', '2553');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'Accionista 60'), 60, '2020-01-01', null, 'individual', true, 'shareholder');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'Accionista 40'), 40, '2020-01-01', null, 'individual', false, 'shareholder');
  perform 1 from public.equity_provision_accounts(v, 'test');
  perform pg_temp.ok(pg_temp.accts(v) = array['25000 Loans from Shareholders – Accionista 60','25001 Loans from Shareholders – Accionista 40',
    '31000 Common Stock','31500 Additional Paid-in Capital','32000 Retained Earnings / AAA',
    '33000 Shareholder Distributions – Accionista 60','33001 Shareholder Distributions – Accionista 40'], 'caso 4: distribuciones y préstamos por accionista; stock, APIC y RE únicos');
end $$;

-- ── Caso 5: partnership con cambio de % el 01/07 (cuentas por dueño) ──
do $$
declare v uuid := pg_temp.mk_client('Caso5 partnership'); a uuid; b uuid;
begin
  perform pg_temp.mk_profile(v, 'partnership'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  a := pg_temp.mk_persona(v, 'Socia A'); b := pg_temp.mk_persona(v, 'Socio B');
  perform pg_temp.mk_owner(v, a, 50, '2020-01-01', '2026-06-30'); perform pg_temp.mk_owner(v, b, 50, '2020-01-01', '2026-06-30');
  perform pg_temp.mk_owner(v, a, 70, '2026-07-01'); perform pg_temp.mk_owner(v, b, 30, '2026-07-01');
  perform 1 from public.equity_provision_accounts(v, 'test');
  -- Los tramos de participación NO duplican cuentas: una cuenta por persona
  perform pg_temp.ok(pg_temp.accts(v) = array['30100 Partner Capital – Socia A','30101 Partner Capital – Socio B',
    '30500 Partner Contributions – Socia A','30501 Partner Contributions – Socio B',
    '30700 Partner Distributions – Socia A','30701 Partner Distributions – Socio B'], 'caso 5: cambio 50/50 → 70/30 mantiene UNA cuenta por socio');
  perform pg_temp.ok((select count(*) from public.equity_provision_accounts(v, 'test') where created) = 0, 'caso 5: idempotente con tramos');
  perform pg_temp.ok(pg_temp.codes(v) = '{}', 'caso 5: validación sin errores');
end $$;

-- ── C-corp ──
do $$
declare v uuid := pg_temp.mk_client('C-corp'); 
begin
  perform pg_temp.mk_profile(v, 'corporation'); perform pg_temp.mk_class(v, 'c_corp', '2020-01-01');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'Accionista Único'), 100, '2020-01-01', null, 'individual', false, 'shareholder');
  perform 1 from public.equity_provision_accounts(v, 'test');
  perform pg_temp.ok(pg_temp.accts(v) = array['25000 Loans from Shareholders – Accionista Único','31000 Common Stock','31500 Additional Paid-in Capital',
    '32000 Retained Earnings','34000 Dividends Paid – Accionista Único'], 'C-corp: Retained Earnings sin AAA y Dividends por accionista');
end $$;

-- ── Crear cuentas exige pasos 1-3 sin errores ──
do $$
declare v uuid := pg_temp.mk_client('Cuentas inválidas'); a uuid; b uuid;
begin
  perform pg_temp.raises(format('select * from public.equity_provision_accounts(%L)', v), '23514', 'sin estructura no se crean cuentas');
  perform pg_temp.mk_profile(v, 'llc_multi'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  a := pg_temp.mk_persona(v, 'A'); b := pg_temp.mk_persona(v, 'B');
  perform pg_temp.mk_owner(v, a, 50); perform pg_temp.mk_owner(v, b, 40);
  perform pg_temp.raises(format('select * from public.equity_provision_accounts(%L)', v), '23514', 'suma de % = 90 → no se crean cuentas');
  perform pg_temp.ok((select count(*) from public.chart_accounts where client_id = v) = 0, 'no quedaron cuentas a medias');
end $$;

-- ── Alta completa ──
do $$
declare v uuid := pg_temp.mk_client('Alta completa'); a uuid; b uuid; oa uuid; ob uuid; v_ts timestamptz;
begin
  perform pg_temp.mk_profile(v, 'llc_multi'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  a := pg_temp.mk_persona(v, 'A'); b := pg_temp.mk_persona(v, 'B');
  oa := pg_temp.mk_owner(v, a, 50); ob := pg_temp.mk_owner(v, b, 50);
  perform pg_temp.ok(public.entity_statements_ready(v), 'pasos 1-3 válidos → puede procesar statements');
  insert into public.opening_balances (client_id, as_of, account_code, amount) values (v, '2025-12-31', '10100', 1000);
  insert into public.opening_balances (client_id, as_of, account_code, owner_id, amount) values (v, '2025-12-31', '30100', oa, 400), (v, '2025-12-31', '30101', ob, 400);
  perform pg_temp.raises(format('select public.entity_complete_setup(%L)', v), '23514', 'saldos que no cuadran impiden confirmar el alta');
  perform pg_temp.ok(not exists (select 1 from public.entity_profile where client_id = v and setup_completed_at is not null), 'el alta no quedó marcada');
  update public.opening_balances set amount = 500 where client_id = v and account_code in ('30100','30101');
  v_ts := public.entity_complete_setup(v, 'tester@example.com');
  perform pg_temp.ok(v_ts is not null and (select setup_completed_at from public.entity_profile where client_id = v) is not null, 'alta confirmada cuando todo cuadra');
  perform pg_temp.ok((select count(*) from public.chart_accounts where client_id = v) = 6, 'el alta creó las cuentas de Equity');
  perform pg_temp.ok((select setup_completed_by from public.entity_profile where client_id = v) = 'tester@example.com', 'queda el usuario que confirmó');
end $$;

do $$
declare v uuid := pg_temp.mk_client('Alta directa');
begin
  perform pg_temp.mk_profile(v, 'sole_prop');
  perform pg_temp.raises(format('update public.entity_profile set setup_completed_at = now() where client_id = %L', v), '23514', 'marcar setup_completed_at a mano se bloquea');
  perform pg_temp.raises(format('insert into public.entity_profile (client_id, legal_form, setup_completed_at) values (%L, ''sole_prop'', now())', pg_temp.mk_client('Alta directa 2')), '23514', 'crear el perfil ya "completado" se bloquea');
end $$;

-- ── Guardado atómico por paso ──
do $$
declare v uuid := pg_temp.mk_client('Guardado atómico'); a uuid; b uuid; r jsonb; v_id uuid;
begin
  perform pg_temp.mk_profile(v, 'llc_multi');
  a := pg_temp.mk_persona(v, 'A'); b := pg_temp.mk_persona(v, 'B');

  perform public.entity_save_classifications(v, '[{"classification":"partnership","effective_date":"2024-01-01","election_form":"none"}]', 'tester');
  perform pg_temp.ok((select count(*) from public.tax_classification where client_id = v) = 1, 'save_classifications inserta');
  select id into v_id from public.tax_classification where client_id = v;
  perform public.entity_save_classifications(v, jsonb_build_array(jsonb_build_object('id', v_id, 'classification','s_corp','effective_date','2024-01-01','election_form','2553','election_doc','Drive/GNO/Carta 2553.pdf')), 'tester');
  perform pg_temp.ok((select classification from public.tax_classification where id = v_id) = 's_corp', 'save_classifications actualiza por id');
  perform pg_temp.raises(format('select public.entity_save_classifications(%L, ''[{"classification":"disregarded","effective_date":"2024-01-01"}]'', ''t'')', v), '23514', 'save_classifications valida la combinación forma/clasificación');
  perform pg_temp.ok((select count(*) from public.tax_classification where client_id = v) = 1, 'un guardado inválido no cambia nada (atómico)');

  perform public.entity_save_owners(v, jsonb_build_array(
    jsonb_build_object('persona_id', a, 'role','shareholder','ownership_pct', 60, 'start_date','2024-01-01','is_officer', true),
    jsonb_build_object('persona_id', b, 'role','shareholder','ownership_pct', 40, 'start_date','2024-01-01')), 'tester');
  perform pg_temp.ok((select count(*) from public.owners where client_id = v) = 2 and pg_temp.codes(v) = '{}', 'save_owners inserta 60/40 y valida');
  -- Falla la segunda fila → no queda la primera
  perform pg_temp.raises(format($q$select public.entity_save_owners(%L, jsonb_build_array(
      jsonb_build_object('persona_id', %L, 'role','shareholder','ownership_pct', 100, 'start_date','2024-01-01'),
      jsonb_build_object('persona_id', %L, 'role','shareholder','ownership_pct', 0, 'start_date','2024-01-01')), 't')$q$, v, a, b), '23514', 'save_owners con una fila inválida falla');
  perform pg_temp.ok((select sum(ownership_pct) from public.owners where client_id = v) = 100 and (select count(*) from public.owners where client_id = v) = 2, 'save_owners atómico: quedan los 60/40 originales');
  -- Quitar un dueño con saldos iniciales asignados se bloquea
  insert into public.opening_balances (client_id, as_of, account_code, owner_id, amount)
    values (v, '2025-12-31', '31000', (select id from public.owners where client_id = v and persona_id = a), 100);
  perform pg_temp.raises(format($q$select public.entity_save_owners(%L, jsonb_build_array(
      jsonb_build_object('persona_id', %L, 'role','shareholder','ownership_pct', 100, 'start_date','2024-01-01')), 't')$q$, v, b), '23503', 'no se borra un dueño con saldos iniciales');

  perform public.entity_save_opening_balances(v, '2025-12-31', jsonb_build_array(
    jsonb_build_object('account_code','10100','account_name','Banco','amount', 1000, 'source','QB')), 'tester');
  perform pg_temp.ok((select count(*) from public.opening_balances where client_id = v) = 1, 'save_opening_balances reemplaza el conjunto');
end $$;
