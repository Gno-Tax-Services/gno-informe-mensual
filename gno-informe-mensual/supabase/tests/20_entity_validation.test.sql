-- Validaciones del módulo Entidad y Equity: combinaciones forma legal/clasificación,
-- suma de % = 100, número de dueños, S-corp con entidades, cuadre de saldos iniciales.
\ir helpers.sql

-- ── Combinaciones forma legal × clasificación (tabla de la spec) ──
do $$
declare
  forms text[] := array['sole_prop','llc_single','llc_multi','partnership','corporation'];
  classes text[] := array['disregarded','partnership','s_corp','c_corp'];
  allowed jsonb := '{
    "sole_prop":   ["disregarded"],
    "llc_single":  ["disregarded","s_corp","c_corp"],
    "llc_multi":   ["partnership","s_corp","c_corp"],
    "partnership": ["partnership"],
    "corporation": ["s_corp","c_corp"]}';
  f text; c text; v_client uuid; v_ok boolean; v_state text; n int := 0;
begin
  foreach f in array forms loop
    perform pg_temp.ok(public.entity_allowed_classifications(f) = array(select jsonb_array_elements_text(allowed -> f)),
                       'entity_allowed_classifications(' || f || ') = tabla de la spec');
    foreach c in array classes loop
      v_client := pg_temp.mk_client('Combo ' || f || ' ' || c);
      perform pg_temp.mk_profile(v_client, f);
      v_ok := allowed -> f ? c;
      begin
        perform pg_temp.mk_class(v_client, c, '2026-01-01', case c when 's_corp' then '2553' else 'none' end);
        v_state := null;
      exception when others then get stacked diagnostics v_state = returned_sqlstate;
      end;
      if v_ok and v_state is not null then raise exception 'FALLÓ: % + % debía ser válida (%)', f, c, v_state; end if;
      if not v_ok and v_state is distinct from '23514' then raise exception 'FALLÓ: % + % debía bloquearse (%)', f, c, v_state; end if;
      n := n + 1;
    end loop;
  end loop;
  perform pg_temp.ok(n = 20, '20 combinaciones forma legal × clasificación verificadas contra la tabla');
end $$;

do $$
declare v uuid := pg_temp.mk_client('Orden Combo');
begin
  -- Sin estructura no se puede clasificar
  perform pg_temp.raises(format('insert into public.tax_classification (client_id, classification, effective_date) values (%L, ''disregarded'', ''2026-01-01'')', v),
    '23514', 'clasificación sin entity_profile se bloquea');
  perform pg_temp.mk_profile(v, 'llc_single');
  perform pg_temp.mk_class(v, 's_corp', '2026-01-01', '2553');
  perform pg_temp.raises(format('update public.entity_profile set legal_form = ''sole_prop'' where client_id = %L', v), '23514',
    'cambiar la forma legal no deja una clasificación inválida');
  update public.entity_profile set legal_form = 'corporation' where client_id = v;
  perform pg_temp.ok(true, 'cambiar a una forma legal compatible sí se permite');
end $$;

-- ── Clasificación vigente: effective_date más reciente <= fecha ──
do $$
declare v uuid := pg_temp.mk_client('Vigente');
begin
  perform pg_temp.mk_profile(v, 'llc_single');
  perform pg_temp.mk_class(v, 'disregarded', '2024-01-01');
  perform pg_temp.mk_class(v, 's_corp', '2026-01-01', '2553');
  perform pg_temp.ok(public.entity_classification_on(v, '2023-12-31') is null, 'antes de la primera elección: sin clasificación');
  perform pg_temp.ok(public.entity_classification_on(v, '2025-12-31') = 'disregarded', '31/12/2025 → disregarded');
  perform pg_temp.ok(public.entity_classification_on(v, '2026-01-01') = 's_corp', '01/01/2026 (día efectivo) → s_corp');
  perform pg_temp.ok(public.entity_classification_on(v, '2026-11-21') = 's_corp', 'fecha posterior → s_corp');
end $$;

-- ── Suma de % = 100 ──
do $$
declare v uuid; a uuid; b uuid; c uuid;
begin
  -- 50/50 válido
  v := pg_temp.mk_client('Suma 5050'); perform pg_temp.mk_profile(v, 'llc_multi'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  a := pg_temp.mk_persona(v, 'Socio A'); b := pg_temp.mk_persona(v, 'Socio B');
  perform pg_temp.mk_owner(v, a, 50); perform pg_temp.mk_owner(v, b, 50);
  perform pg_temp.ok(pg_temp.codes(v) = '{}', '50/50 no tiene errores');

  -- 60/30 = 90
  v := pg_temp.mk_client('Suma 6030'); perform pg_temp.mk_profile(v, 'llc_multi'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  a := pg_temp.mk_persona(v, 'Socio A'); b := pg_temp.mk_persona(v, 'Socio B');
  perform pg_temp.mk_owner(v, a, 60); perform pg_temp.mk_owner(v, b, 30);
  perform pg_temp.ok('OWNER_PCT_SUM' = any (pg_temp.codes(v)), '60 + 30 = 90 → OWNER_PCT_SUM');
  perform pg_temp.ok(not public.entity_statements_ready(v), 'suma ≠ 100 impide procesar statements');
  -- 60/45 = 105
  update public.owners set ownership_pct = 45 where client_id = v and persona_id = b;
  perform pg_temp.ok('OWNER_PCT_SUM' = any (pg_temp.codes(v)), '60 + 45 = 105 → OWNER_PCT_SUM');

  -- Tres dueños con 33.3333 no suman 100; con 33.3334 en el último sí
  v := pg_temp.mk_client('Suma tercios'); perform pg_temp.mk_profile(v, 'llc_multi'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  a := pg_temp.mk_persona(v, 'T1'); b := pg_temp.mk_persona(v, 'T2'); c := pg_temp.mk_persona(v, 'T3');
  perform pg_temp.mk_owner(v, a, 33.3333); perform pg_temp.mk_owner(v, b, 33.3333); perform pg_temp.mk_owner(v, c, 33.3333);
  perform pg_temp.ok('OWNER_PCT_SUM' = any (pg_temp.codes(v)), '3 × 33.3333 = 99.9999 → error');
  update public.owners set ownership_pct = 33.3334 where client_id = v and persona_id = c;
  perform pg_temp.ok(pg_temp.codes(v) = '{}', '33.3333 + 33.3333 + 33.3334 = 100 → sin errores');

  -- Rango por fila
  perform pg_temp.raises(format('update public.owners set ownership_pct = 0 where client_id = %L and persona_id = %L', v, a), '23514', 'ownership_pct = 0 se bloquea');
  perform pg_temp.raises(format('update public.owners set ownership_pct = 100.0001 where client_id = %L and persona_id = %L', v, a), '23514', 'ownership_pct > 100 se bloquea');
  perform pg_temp.raises(format('update public.owners set end_date = ''2019-01-01'' where client_id = %L and persona_id = %L', v, a), '23514', 'end_date < start_date se bloquea');

  -- Caso 5: 50/50 hasta el 30/06 y 70/30 desde el 01/07 (cada tramo suma 100)
  v := pg_temp.mk_client('Cambio de porcentaje'); perform pg_temp.mk_profile(v, 'partnership'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  a := pg_temp.mk_persona(v, 'Socio A'); b := pg_temp.mk_persona(v, 'Socio B');
  perform pg_temp.mk_owner(v, a, 50, '2020-01-01', '2026-06-30'); perform pg_temp.mk_owner(v, b, 50, '2020-01-01', '2026-06-30');
  perform pg_temp.mk_owner(v, a, 70, '2026-07-01'); perform pg_temp.mk_owner(v, b, 30, '2026-07-01');
  perform pg_temp.ok(pg_temp.codes(v) = '{}', 'caso 5: 50/50 → 70/30 el 01/07 suma 100 en cada tramo');
  perform pg_temp.ok((select count(*) from public.entity_owner_segments(v)) = 2, 'caso 5: dos tramos de participación');
  -- Si el nuevo tramo no suma 100 se detecta SOLO en esa fecha
  update public.owners set ownership_pct = 20 where client_id = v and persona_id = b and start_date = '2026-07-01';
  perform pg_temp.ok((select jsonb_array_length(detail) from public.entity_validate(v) where code = 'OWNER_PCT_SUM') = 1
                      and (select detail -> 0 ->> 'from' from public.entity_validate(v) where code = 'OWNER_PCT_SUM') = '2026-07-01',
                     'tramo 70/20 → error solo desde 2026-07-01');
end $$;

-- ── Número de dueños por forma legal ──
do $$
declare v uuid; a uuid; b uuid;
begin
  v := pg_temp.mk_client('Sole 2 dueños'); perform pg_temp.mk_profile(v, 'sole_prop'); perform pg_temp.mk_class(v, 'disregarded', '2020-01-01');
  a := pg_temp.mk_persona(v, 'A'); b := pg_temp.mk_persona(v, 'B');
  perform pg_temp.mk_owner(v, a, 50, '2020-01-01', null, 'individual', false, 'owner'); perform pg_temp.mk_owner(v, b, 50, '2020-01-01', null, 'individual', false, 'owner');
  perform pg_temp.ok('OWNER_COUNT' = any (pg_temp.codes(v)), 'sole proprietor con 2 dueños → OWNER_COUNT');

  v := pg_temp.mk_client('Sole 1 dueño'); perform pg_temp.mk_profile(v, 'sole_prop'); perform pg_temp.mk_class(v, 'disregarded', '2020-01-01');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'A'), 100, '2020-01-01', null, 'individual', false, 'owner');
  perform pg_temp.ok(pg_temp.codes(v) = '{}', 'sole proprietor con 1 dueño al 100% válido');

  v := pg_temp.mk_client('LLC multi 1 dueño'); perform pg_temp.mk_profile(v, 'llc_multi'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'A'), 100);
  perform pg_temp.ok('OWNER_COUNT' = any (pg_temp.codes(v)), 'LLC varios miembros con 1 dueño → OWNER_COUNT');

  v := pg_temp.mk_client('Partnership 1 dueño'); perform pg_temp.mk_profile(v, 'partnership'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'A'), 100);
  perform pg_temp.ok('OWNER_COUNT' = any (pg_temp.codes(v)), 'partnership con 1 dueño → OWNER_COUNT');

  v := pg_temp.mk_client('LLC single 2 dueños'); perform pg_temp.mk_profile(v, 'llc_single'); perform pg_temp.mk_class(v, 'disregarded', '2020-01-01');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'A'), 50); perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'B'), 50);
  perform pg_temp.ok('OWNER_COUNT' = any (pg_temp.codes(v)), 'LLC un miembro con 2 dueños → OWNER_COUNT');

  v := pg_temp.mk_client('Corp 1 accionista'); perform pg_temp.mk_profile(v, 'corporation'); perform pg_temp.mk_class(v, 's_corp', '2020-01-01', '2553');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'A'), 100, '2020-01-01', null, 'individual', true, 'shareholder');
  perform pg_temp.ok(pg_temp.codes(v) = '{}', 'corporation con 1 accionista válida');

  v := pg_temp.mk_client('Sin dueños'); perform pg_temp.mk_profile(v, 'corporation'); perform pg_temp.mk_class(v, 'c_corp', '2020-01-01');
  perform pg_temp.ok('OWNERS_MISSING' = any (pg_temp.codes(v)), 'sin dueños → OWNERS_MISSING');
  perform pg_temp.ok(pg_temp.codes(pg_temp.mk_client('Sin perfil')) = array['ENTITY_MISSING'], 'sin entity_profile → ENTITY_MISSING');
end $$;

-- ── S-corp con dueño que no es persona física ──
do $$
declare v uuid; a uuid; b uuid;
begin
  v := pg_temp.mk_client('S-corp con LLC dueña'); perform pg_temp.mk_profile(v, 'corporation');
  a := pg_temp.mk_persona(v, 'Persona'); b := pg_temp.mk_persona(v, 'Otra LLC');
  perform pg_temp.mk_owner(v, a, 50, '2020-01-01', null, 'individual', false, 'shareholder');
  perform pg_temp.mk_owner(v, b, 50, '2020-01-01', null, 'entity', false, 'shareholder');
  perform pg_temp.mk_class(v, 'c_corp', '2020-01-01');   -- C-corp sí puede tener entidades como accionistas
  perform pg_temp.raises(format('insert into public.tax_classification (client_id, classification, effective_date, election_form) values (%L, ''s_corp'', ''2026-01-01'', ''2553'')', v),
    '23514', 'elegir S-corp con un dueño entidad se bloquea');
  v := pg_temp.mk_client('S-corp luego entidad'); perform pg_temp.mk_profile(v, 'corporation'); perform pg_temp.mk_class(v, 's_corp', '2020-01-01', '2553');
  a := pg_temp.mk_persona(v, 'Persona'); b := pg_temp.mk_persona(v, 'Otra Corp');
  perform pg_temp.mk_owner(v, a, 100, '2020-01-01', null, 'individual', false, 'shareholder');
  perform pg_temp.raises(format('select pg_temp.mk_owner(%L, %L, 50, ''2020-01-01'', null, ''entity'', false, ''shareholder'')', v, b),
    '23514', 'agregar un dueño entidad a una S-corp vigente se bloquea');
  -- Un dueño entidad que salió ANTES de la elección S-corp no bloquea
  v := pg_temp.mk_client('Entidad previa a S-corp'); perform pg_temp.mk_profile(v, 'llc_single');
  a := pg_temp.mk_persona(v, 'Persona'); b := pg_temp.mk_persona(v, 'Holding');
  perform pg_temp.mk_class(v, 'c_corp', '2020-01-01', '8832');
  perform pg_temp.mk_owner(v, b, 100, '2020-01-01', '2023-12-31', 'entity', false, 'member');
  perform pg_temp.mk_owner(v, a, 100, '2024-01-01', null, 'individual', false, 'member');
  perform pg_temp.mk_class(v, 's_corp', '2024-01-01', '2553');
  perform pg_temp.ok(pg_temp.codes(v) = '{}', 'dueño entidad que salió antes de la elección S-corp no bloquea');
end $$;

do $$
declare v uuid := pg_temp.mk_client('Cruce de clientes'); w uuid := pg_temp.mk_client('Otro cliente'); p_ajena uuid;
begin
  perform pg_temp.mk_profile(v, 'llc_single');
  p_ajena := pg_temp.mk_persona(w, 'Persona de otro cliente');
  perform pg_temp.raises(format('select pg_temp.mk_owner(%L, %L, 100)', v, p_ajena), '23514', 'owners rechaza una persona de otro cliente');
  perform pg_temp.mk_profile(w, 'llc_single');
  perform pg_temp.raises(format('insert into public.opening_balances (client_id, as_of, account_code, owner_id, amount) values (%L, ''2025-12-31'', ''30000'', %L, 1)',
    v, pg_temp.mk_owner(w, p_ajena, 100)), '23514', 'opening_balances rechaza un dueño de otro cliente');
end $$;

-- ── Cuadre de saldos iniciales: activos − pasivos − capital = 0 ──
do $$
declare v uuid; a uuid; b uuid; oa uuid; ob uuid; r record;
begin
  -- Disregarded: banco 20,000 = capital 20,000
  v := pg_temp.mk_client('Saldos disregarded'); perform pg_temp.mk_profile(v, 'sole_prop'); perform pg_temp.mk_class(v, 'disregarded', '2020-01-01');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'A'), 100, '2020-01-01', null, 'individual', false, 'owner');
  insert into public.opening_balances (client_id, as_of, account_code, account_name, amount) values
    (v, '2025-12-31', '10100', 'Banco operativo', 20000), (v, '2025-12-31', '30000', 'Capital', 20000);
  perform pg_temp.ok((select balanced from public.opening_balance_check(v)), 'banco 20,000 = capital 20,000 cuadra');
  perform pg_temp.ok(pg_temp.codes(v) = '{}', 'saldos que cuadran no generan errores');

  -- Activos − pasivos − capital: banco 50,000 + activo fijo 30,000 − préstamo 25,000 − tarjeta 5,000 = capital 50,000
  v := pg_temp.mk_client('Saldos con pasivos'); perform pg_temp.mk_profile(v, 'sole_prop'); perform pg_temp.mk_class(v, 'disregarded', '2020-01-01');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'A'), 100, '2020-01-01', null, 'individual', false, 'owner');
  insert into public.opening_balances (client_id, as_of, account_code, amount) values
    (v, '2025-12-31', '10100', 50000), (v, '2025-12-31', '15000', 30000),
    (v, '2025-12-31', '21000', 25000), (v, '2025-12-31', '22000', 5000), (v, '2025-12-31', '30000', 50000);
  select * into r from public.opening_balance_check(v);
  perform pg_temp.ok(r.assets = 80000 and r.liabilities = 30000 and r.equity = 50000 and r.diff = 0 and r.balanced, 'cuadre con préstamo y tarjeta: 80,000 − 30,000 − 50,000 = 0');

  -- Descuadre de un centavo
  update public.opening_balances set amount = 50000.01 where client_id = v and account_code = '30000';
  select * into r from public.opening_balance_check(v);
  perform pg_temp.ok(r.diff = -0.01 and not r.balanced, 'descuadre de $0.01 se detecta');
  perform pg_temp.ok('BALANCE_UNBALANCED' = any (pg_temp.codes(v)), 'descuadre → BALANCE_UNBALANCED');
  perform pg_temp.ok((select detail ->> 'diff' from public.entity_validate(v) where code = 'BALANCE_UNBALANCED') = '-0.01', 'el detalle trae la diferencia');

  -- Sin saldos: aviso, no error (cliente que empieza en cero)
  v := pg_temp.mk_client('Saldos vacíos'); perform pg_temp.mk_profile(v, 'sole_prop'); perform pg_temp.mk_class(v, 'disregarded', '2020-01-01');
  perform pg_temp.mk_owner(v, pg_temp.mk_persona(v, 'A'), 100, '2020-01-01', null, 'individual', false, 'owner');
  perform pg_temp.ok('BALANCE_EMPTY' = any (pg_temp.codes(v, 'warn')) and pg_temp.codes(v) = '{}', 'sin saldos: solo aviso BALANCE_EMPTY');

  -- Una sola fecha de corte
  insert into public.opening_balances (client_id, as_of, account_code, amount) values (v, '2025-12-31', '10100', 1), (v, '2024-12-31', '10100', 1);
  perform pg_temp.ok('BALANCE_MULTIPLE_DATES' = any (pg_temp.codes(v)), 'dos fechas de corte → BALANCE_MULTIPLE_DATES');

  -- Partnership: el capital se captura por dueño, no se acepta un solo total (piloto: 40,950.76 → 20,475.38 c/u)
  v := pg_temp.mk_client('Saldos partnership'); perform pg_temp.mk_profile(v, 'llc_multi'); perform pg_temp.mk_class(v, 'partnership', '2020-01-01');
  a := pg_temp.mk_persona(v, 'Socio A'); b := pg_temp.mk_persona(v, 'Socio B');
  oa := pg_temp.mk_owner(v, a, 50); ob := pg_temp.mk_owner(v, b, 50);
  insert into public.opening_balances (client_id, as_of, account_code, amount) values (v, '2025-12-31', '10100', 40950.76);
  insert into public.opening_balances (client_id, as_of, account_code, amount) values (v, '2025-12-31', '30100', 40950.76);
  perform pg_temp.ok('BALANCE_OWNER_REQUIRED' = any (pg_temp.codes(v)) and not ('BALANCE_UNBALANCED' = any (pg_temp.codes(v))),
                     'partnership: capital en un solo total (sin dueño) → BALANCE_OWNER_REQUIRED');
  delete from public.opening_balances where client_id = v and account_code = '30100';
  insert into public.opening_balances (client_id, as_of, account_code, owner_id, amount) values
    (v, '2025-12-31', '30100', oa, 20475.38), (v, '2025-12-31', '30101', ob, 20475.38);
  perform pg_temp.ok(pg_temp.codes(v) = '{}', 'partnership: capital por dueño 20,475.38 + 20,475.38 = 40,950.76 cuadra');

  -- Una cuenta que no es de la plantilla vigente
  insert into public.opening_balances (client_id, as_of, account_code, amount) values (v, '2025-12-31', '31000', 0);
  perform pg_temp.ok('BALANCE_ACCOUNT_NOT_IN_TEMPLATE' = any (pg_temp.codes(v)), 'Common Stock en una partnership → BALANCE_ACCOUNT_NOT_IN_TEMPLATE');

  -- S-corp: capital por accionista
  v := pg_temp.mk_client('Saldos S-corp'); perform pg_temp.mk_profile(v, 'corporation'); perform pg_temp.mk_class(v, 's_corp', '2020-01-01', '2553');
  a := pg_temp.mk_persona(v, 'Accionista A'); b := pg_temp.mk_persona(v, 'Accionista B');
  oa := pg_temp.mk_owner(v, a, 60, '2020-01-01', null, 'individual', true, 'shareholder'); ob := pg_temp.mk_owner(v, b, 40, '2020-01-01', null, 'individual', false, 'shareholder');
  insert into public.opening_balances (client_id, as_of, account_code, amount) values (v, '2025-12-31', '10100', 10000), (v, '2025-12-31', '31000', 10000);
  perform pg_temp.ok('BALANCE_OWNER_REQUIRED' = any (pg_temp.codes(v)), 'S-corp: Common Stock sin accionista → BALANCE_OWNER_REQUIRED');
  delete from public.opening_balances where client_id = v and account_code = '31000';
  insert into public.opening_balances (client_id, as_of, account_code, owner_id, amount) values (v, '2025-12-31', '31000', oa, 6000), (v, '2025-12-31', '31000', ob, 4000);
  perform pg_temp.ok(pg_temp.codes(v) = '{}', 'S-corp: Common Stock por accionista (6,000 + 4,000) cuadra');

  -- Opening Balance Equity con saldo: aviso
  insert into public.opening_balances (client_id, as_of, account_code, amount) values (v, '2025-12-31', '39000', 500), (v, '2025-12-31', '10200', 500);
  perform pg_temp.ok('OPENING_BALANCE_EQUITY' = any (pg_temp.codes(v, 'warn')) and pg_temp.codes(v) = '{}', 'saldo en Opening Balance Equity → aviso (hallazgo #6)');

  -- Rechazos por fila
  perform pg_temp.raises(format('insert into public.opening_balances (client_id, as_of, account_code, amount) values (%L, ''2025-12-31'', ''40000'', 1)', v), '23514', 'solo cuentas 1xxxx/2xxxx/3xxxx');
  perform pg_temp.raises(format('insert into public.opening_balances (client_id, as_of, account_code, amount) values (%L, ''2025-12-31'', ''10100'', 1)', v), '23505', 'misma cuenta/fecha no se repite');
  perform pg_temp.raises(format('insert into public.opening_balances (client_id, as_of, account_code, amount, source) values (%L, ''2025-12-31'', ''10300'', 1, ''otro'')', v), '23514', 'source solo QB/prior_return/statement/GNO');
end $$;
