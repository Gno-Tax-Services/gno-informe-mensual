-- ─────────────────────────────────────────────────────────────
-- 0013_entity_equity.sql
-- Módulo Entidad y Equity (spec del 21-nov-2026).
-- Registra por cliente: estructura legal (entity_profile), historial de
-- clasificación fiscal (tax_classification), dueños (owners) y saldos
-- iniciales (opening_balances), y crea las cuentas de Equity de la plantilla
-- vigente (chart_accounts + equity_provision_accounts).
--
-- Seguridad (mismo patrón que 0009/0011/0012):
--  * RLS activo, solo service_role. anon/authenticated sin privilegios sobre
--    tablas NI sobre las funciones de este módulo.
--  * SSN/ITIN/EIN NO viven aquí. owners.persona_id apunta a personas (0012),
--    cuyos identificadores van cifrados en identificadores. entity_profile solo
--    guarda ein_last4 (4 dígitos).
--  * DLP (bloquear_id_en_claro, 0012) también en los campos de texto libre.
--  * Bitácora (log_change) y updated_at en todas las tablas.
--
-- Diferencias deliberadas con la spec (ver README del PR):
--  * chart_accounts es una tabla extra: "crear las cuentas de Equity" necesita
--    dónde guardarlas, y no existe catálogo de cuentas todavía.
--  * owners.seq: orden de captura; fija la numeración por dueño (30100, 30101…).
--  * owners.holder_type ('individual'|'entity'): la regla "S-corp con un dueño
--    que no es persona física" no se puede evaluar sin ese dato.
--  * opening_balances.account_name: etiqueta de bancos/préstamos/tarjetas,
--    porque el catálogo base de cuentas aún está pendiente de decidir.
--  * "enum" de la spec = text + CHECK, como el resto de las migraciones.
--  * El tipo de cuenta (activo/pasivo/equity) sale del primer dígito del
--    código (1xxxx/2xxxx/3xxxx, numeración tipo QuickBooks).
-- ─────────────────────────────────────────────────────────────

-- ── Tablas ───────────────────────────────────────────────────

-- Una fila por cliente
create table if not exists public.entity_profile (
  client_id           uuid primary key references public.clients(id) on delete restrict,
  legal_form          text not null
    check (legal_form in ('sole_prop','llc_single','llc_multi','partnership','corporation')),
  state_of_formation  text not null default 'LA' check (state_of_formation ~ '^[A-Z]{2}$'),
  formation_date      date,
  fiscal_year_end     text not null default '12-31'
    check (fiscal_year_end ~ '^((0[13578]|1[02])-(0[1-9]|[12][0-9]|3[01])|(0[469]|11)-(0[1-9]|[12][0-9]|30)|02-(0[1-9]|1[0-9]|2[0-9]))$'),
  accounting_basis    text not null default 'cash' check (accounting_basis in ('cash')),
  ein_last4           text check (ein_last4 ~ '^[0-9]{4}$'),   -- el EIN completo va cifrado en identificadores (0012)
  setup_completed_at  timestamptz,                              -- solo lo fija entity_complete_setup()
  setup_completed_by  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          text
);

-- Historial: una fila por cada elección. Vigente = effective_date más reciente <= fecha.
create table if not exists public.tax_classification (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete restrict,
  classification  text not null check (classification in ('disregarded','partnership','s_corp','c_corp')),
  effective_date  date not null,
  election_form   text not null default 'none' check (election_form in ('none','8832','2553')),
  election_doc    text,          -- ubicación en Drive de la carta de aceptación del IRS
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text,
  unique (client_id, effective_date)
);
create index if not exists tax_classification_client_idx on public.tax_classification(client_id, effective_date);

-- Una fila por dueño (y por tramo de participación)
create table if not exists public.owners (
  id             uuid primary key default gen_random_uuid(),
  seq            bigint generated always as identity,   -- orden de captura: define la numeración 30100, 30101…
  client_id      uuid not null references public.clients(id) on delete restrict,
  persona_id     uuid not null references public.personas(id) on delete restrict,  -- SSN/ITIN cifrados allá, nunca aquí
  role           text not null check (role in ('owner','member','partner','shareholder')),
  holder_type    text not null default 'individual' check (holder_type in ('individual','entity')),
  ownership_pct  numeric(7,4) not null check (ownership_pct > 0 and ownership_pct <= 100),
  start_date     date not null,
  end_date       date,           -- inclusivo; null = vigente
  is_officer     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text,
  check (end_date is null or end_date >= start_date),
  check (not (is_officer and holder_type = 'entity')),
  unique (client_id, persona_id, start_date)
);
create index if not exists owners_client_idx on public.owners(client_id);

-- Cuentas de Equity creadas desde la plantilla de la clasificación vigente
create table if not exists public.chart_accounts (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete restrict,
  classification_id uuid not null references public.tax_classification(id) on delete cascade,
  template          text not null check (template in ('disregarded','partnership','s_corp','c_corp')),
  code              text not null check (code ~ '^[0-9]{5}$'),
  name_en           text not null,
  name_es           text not null,
  role              text not null,
  persona_id        uuid references public.personas(id) on delete restrict,   -- cuenta por dueño: una por PERSONA, no por tramo de participación
  opened_on         date not null,
  closed_on         date,          -- cambio de clasificación: día previo a la effective_date nueva
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        text,
  check (closed_on is null or closed_on >= opened_on),
  unique (client_id, code, opened_on)
);
create index if not exists chart_accounts_client_idx on public.chart_accounts(client_id, code);

-- Saldos al inicio del primer periodo procesado
create table if not exists public.opening_balances (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete restrict,
  as_of         date not null,    -- normalmente 12-31 del año anterior
  account_code  text not null check (account_code ~ '^[123][0-9]{4}$'),  -- 1 activo · 2 pasivo · 3 equity
  account_name  text,
  owner_id      uuid references public.owners(id) on delete restrict,   -- obligatorio en capital por dueño (ver entity_validate)
  amount        numeric(14,2) not null,   -- positivo = saldo natural de la cuenta
  source        text not null default 'GNO' check (source in ('QB','prior_return','statement','GNO')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text
);
create index if not exists opening_balances_client_idx on public.opening_balances(client_id, as_of);
create unique index if not exists opening_balances_unq
  on public.opening_balances(client_id, as_of, account_code, coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── Reglas puras (sin tablas) ────────────────────────────────

-- Combinaciones válidas de forma legal y clasificación fiscal
create or replace function public.entity_allowed_classifications(p_legal_form text)
returns text[] language sql immutable as $$
  select case p_legal_form
    when 'sole_prop'   then array['disregarded']
    when 'llc_single'  then array['disregarded','s_corp','c_corp']
    when 'llc_multi'   then array['partnership','s_corp','c_corp']
    when 'partnership' then array['partnership']
    when 'corporation' then array['s_corp','c_corp']
    else array[]::text[]
  end
$$;

-- Rol de una cuenta de Equity según su código (los códigos por dueño suman un desplazamiento al código base)
create or replace function public.equity_code_role(p_code text)
returns text language sql immutable as $$
  select case
    when p_code ~ '^25[0-9]{3}$' then 'shareholder_loans'
    when p_code !~ '^3[0-9]{4}$' then null
    when p_code::int between 30000 and 30099 then 'owner_capital'
    when p_code::int between 30100 and 30499 then 'partner_capital'
    when p_code::int between 30500 and 30699 then 'contributions'
    when p_code::int between 30700 and 30999 then 'distributions'
    when p_code::int between 31000 and 31499 then 'common_stock'
    when p_code::int between 31500 and 31999 then 'apic'
    when p_code::int between 32000 and 32999 then 'retained_earnings'
    when p_code::int between 33000 and 33999 then 'distributions'
    when p_code::int between 34000 and 34999 then 'dividends'
    when p_code::int between 39000 and 39999 then 'opening_balance_equity'
    else null
  end
$$;

-- Plantillas de Equity (spec, "Plantillas de Equity"). La clasificación fiscal vigente,
-- no la forma legal, decide qué cuentas existen. per_owner = una cuenta por fila de owners.
create or replace function public.equity_template(p_classification text)
returns table (code text, name_en text, name_es text, role text, per_owner boolean)
language sql immutable as $$
  select t.code, t.name_en, t.name_es, t.role, t.per_owner
  from (values
    ('disregarded','30000','Owner''s Capital',               'Capital del dueño',                   'owner_capital',     false),
    ('disregarded','30500','Owner''s Contributions',         'Aportes del dueño',                   'contributions',     false),
    ('disregarded','30700','Owner''s Draws',                 'Retiros del dueño',                   'distributions',     false),
    ('partnership','30100','Partner Capital',                'Capital del socio',                   'partner_capital',   true),
    ('partnership','30500','Partner Contributions',          'Aportes del socio',                   'contributions',     true),
    ('partnership','30700','Partner Distributions',          'Distribuciones al socio',             'distributions',     true),
    ('s_corp',     '25000','Loans from Shareholders',        'Préstamos de accionistas',            'shareholder_loans', true),
    ('s_corp',     '31000','Common Stock',                   'Acciones comunes',                    'common_stock',      false),
    ('s_corp',     '31500','Additional Paid-in Capital',     'Capital pagado adicional',            'apic',              false),
    ('s_corp',     '32000','Retained Earnings / AAA',        'Utilidades retenidas / AAA',          'retained_earnings', false),
    ('s_corp',     '33000','Shareholder Distributions',      'Distribuciones a accionistas',        'distributions',     true),
    ('c_corp',     '25000','Loans from Shareholders',        'Préstamos de accionistas',            'shareholder_loans', true),
    ('c_corp',     '31000','Common Stock',                   'Acciones comunes',                    'common_stock',      false),
    ('c_corp',     '31500','Additional Paid-in Capital',     'Capital pagado adicional',            'apic',              false),
    ('c_corp',     '32000','Retained Earnings',              'Utilidades retenidas',                'retained_earnings', false),
    ('c_corp',     '34000','Dividends Paid',                 'Dividendos pagados',                  'dividends',         true)
  ) as t(cls, code, name_en, name_es, role, per_owner)
  where t.cls = p_classification
  order by t.code
$$;

-- ── Consultas de apoyo ───────────────────────────────────────

-- Clasificación vigente: la fila con la effective_date más reciente <= p_date
create or replace function public.entity_classification_on(p_client_id uuid, p_date date)
returns text language sql stable as $$
  select tc.classification from public.tax_classification tc
  where tc.client_id = p_client_id and tc.effective_date <= p_date
  order by tc.effective_date desc limit 1
$$;

-- Tramos de participación: en cada fecha de cambio, suma de % y número de dueños vigentes.
create or replace function public.entity_owner_segments(p_client_id uuid)
returns table (seg_start date, total_pct numeric, owner_count int)
language sql stable as $$
  with bp as (
    select o.start_date as d from public.owners o where o.client_id = p_client_id
    union
    select o.end_date + 1 from public.owners o where o.client_id = p_client_id and o.end_date is not null
  ), lim as (
    select max(coalesce(o.end_date, 'infinity'::date)) as mx from public.owners o where o.client_id = p_client_id
  )
  select bp.d, coalesce(sum(o.ownership_pct), 0)::numeric, count(o.id)::int
  from bp cross join lim
  left join public.owners o
    on o.client_id = p_client_id and o.start_date <= bp.d and (o.end_date is null or o.end_date >= bp.d)
  where bp.d <= lim.mx
  group by bp.d
  order by bp.d
$$;

-- Periodos de cada clasificación: [effective_date, siguiente effective_date - 1]
create or replace view public.tax_classification_periods as
select tc.id, tc.client_id, tc.classification, tc.effective_date,
       (lead(tc.effective_date) over (partition by tc.client_id order by tc.effective_date)) - 1 as period_end
from public.tax_classification tc;

-- Dueños que no son persona física durante un periodo de S-corp (bloqueo duro)
create or replace function public.entity_s_corp_entity_owners(p_client_id uuid)
returns setof uuid language sql stable as $$
  select o.id
  from public.owners o
  join public.tax_classification_periods p
    on p.client_id = o.client_id and p.classification = 's_corp'
   and o.start_date <= coalesce(p.period_end, 'infinity'::date)
   and coalesce(o.end_date, 'infinity'::date) >= p.effective_date
  where o.client_id = p_client_id and o.holder_type = 'entity'
$$;

-- Cuadre de saldos iniciales: activos − pasivos − equity = 0 (tipo por primer dígito)
create or replace function public.opening_balance_check(p_client_id uuid, p_as_of date default null)
returns table (as_of date, assets numeric, liabilities numeric, equity numeric, diff numeric, balanced boolean)
language sql stable as $$
  with d as (
    select coalesce(p_as_of, (select max(b.as_of) from public.opening_balances b where b.client_id = p_client_id)) as as_of
  ), s as (
    select d.as_of,
      coalesce(sum(b.amount) filter (where left(b.account_code, 1) = '1'), 0) as a,
      coalesce(sum(b.amount) filter (where left(b.account_code, 1) = '2'), 0) as l,
      coalesce(sum(b.amount) filter (where left(b.account_code, 1) = '3'), 0) as e
    from d left join public.opening_balances b on b.client_id = p_client_id and b.as_of = d.as_of
    group by d.as_of
  )
  select s.as_of, s.a, s.l, s.e, s.a - s.l - s.e, (s.a - s.l - s.e) = 0 from s
$$;

-- ── Validación completa (pasos 1 a 4) ────────────────────────
-- Devuelve errores (bloquean) y avisos (solo informan). Los pasos 1-3 sin error
-- habilitan el procesamiento de statements; el paso 4 sin error permite confirmar el alta.
create or replace function public.entity_validate(p_client_id uuid)
returns table (step int, severity text, code text, message text, detail jsonb)
language plpgsql stable as $$
#variable_conflict use_column
declare
  prof public.entity_profile%rowtype;
  r record;
  v_min int; v_max int;
  v_bad jsonb;
  v_n int;
  v_as_of date;
  v_cls text;
  bc record;
  v_roles text[];
  v_per_owner text[];
  v_role text;
  v_sum numeric;
begin
  select * into prof from public.entity_profile where client_id = p_client_id;
  if not found then
    step := 1; severity := 'error'; code := 'ENTITY_MISSING';
    message := 'Falta la estructura corporativa (paso 1)'; detail := null; return next;
    return;
  end if;

  -- Paso 2: clasificación
  select count(*) into v_n from public.tax_classification where client_id = p_client_id;
  if v_n = 0 then
    step := 2; severity := 'error'; code := 'CLASS_MISSING';
    message := 'Falta la clasificación fiscal (paso 2)'; detail := null; return next;
  end if;
  for r in select * from public.tax_classification tc where tc.client_id = p_client_id order by tc.effective_date loop
    if not (r.classification = any (public.entity_allowed_classifications(prof.legal_form))) then
      step := 2; severity := 'error'; code := 'CLASS_INVALID_COMBO';
      message := format('%s no es válida para %s', r.classification, prof.legal_form);
      detail := jsonb_build_object('classification', r.classification, 'legal_form', prof.legal_form, 'effective_date', r.effective_date);
      return next;
    end if;
    if r.election_form <> 'none' and r.election_doc is null then
      step := 2; severity := 'warn'; code := 'ELECTION_DOC_MISSING';
      message := format('Falta la carta de elección (%s) desde %s', r.election_form, r.effective_date);
      detail := jsonb_build_object('effective_date', r.effective_date, 'election_form', r.election_form); return next;
    end if;
  end loop;

  -- Paso 3: dueños
  select count(*) into v_n from public.owners where client_id = p_client_id;
  if v_n = 0 then
    step := 3; severity := 'error'; code := 'OWNERS_MISSING';
    message := 'Falta registrar los dueños (paso 3)'; detail := null; return next;
  else
    v_min := case prof.legal_form when 'sole_prop' then 1 when 'llc_single' then 1 when 'llc_multi' then 2 when 'partnership' then 2 else 1 end;
    v_max := case prof.legal_form when 'sole_prop' then 1 when 'llc_single' then 1 else null end;

    select coalesce(jsonb_agg(jsonb_build_object('from', s.seg_start, 'total_pct', s.total_pct)), '[]'::jsonb) into v_bad
      from public.entity_owner_segments(p_client_id) s where s.total_pct <> 100;
    if jsonb_array_length(v_bad) > 0 then
      step := 3; severity := 'error'; code := 'OWNER_PCT_SUM';
      message := 'La suma de ownership_pct no es 100 en alguna fecha'; detail := v_bad; return next;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('from', s.seg_start, 'owners', s.owner_count)), '[]'::jsonb) into v_bad
      from public.entity_owner_segments(p_client_id) s
      where s.owner_count < v_min or (v_max is not null and s.owner_count > v_max);
    if jsonb_array_length(v_bad) > 0 then
      step := 3; severity := 'error'; code := 'OWNER_COUNT';
      message := format('Número de dueños inválido para %s', prof.legal_form);
      detail := jsonb_build_object('legal_form', prof.legal_form, 'min', v_min, 'max', v_max, 'segments', v_bad); return next;
    end if;

    if exists (select 1 from public.entity_s_corp_entity_owners(p_client_id)) then
      step := 3; severity := 'error'; code := 'OWNER_S_CORP_ENTITY';
      message := 'S-corp con un dueño que no es persona física (otra LLC o corporación)'; detail := null; return next;
    end if;

    if exists (
      select 1 from public.owners o
      where o.client_id = p_client_id and o.is_officer
        and not exists (
          select 1 from public.tax_classification_periods p
          where p.client_id = o.client_id and p.classification in ('s_corp','c_corp')
            and o.start_date <= coalesce(p.period_end, 'infinity'::date)
            and coalesce(o.end_date, 'infinity'::date) >= p.effective_date)
    ) then
      step := 3; severity := 'warn'; code := 'OFFICER_NOT_APPLICABLE';
      message := 'is_officer solo aplica a S-corp/C-corp'; detail := null; return next;
    end if;
  end if;

  -- Paso 4: saldos iniciales
  select count(distinct b.as_of), max(b.as_of) into v_n, v_as_of from public.opening_balances b where b.client_id = p_client_id;
  if v_n = 0 then
    step := 4; severity := 'warn'; code := 'BALANCE_EMPTY';
    message := 'Sin saldos iniciales: el cliente empieza en cero'; detail := null; return next;
    return;
  end if;
  if v_n > 1 then
    step := 4; severity := 'error'; code := 'BALANCE_MULTIPLE_DATES';
    message := 'Los saldos iniciales deben tener una sola fecha de corte'; detail := null; return next;
  end if;

  select * into bc from public.opening_balance_check(p_client_id, v_as_of);
  if not bc.balanced then
    step := 4; severity := 'error'; code := 'BALANCE_UNBALANCED';
    message := format('Los saldos iniciales no cuadran: activos − pasivos − capital = %s', bc.diff);
    detail := jsonb_build_object('assets', bc.assets, 'liabilities', bc.liabilities, 'equity', bc.equity, 'diff', bc.diff);
    return next;
  end if;

  v_cls := public.entity_classification_on(p_client_id, v_as_of);
  if v_cls is not null then
    select array_agg(t.role), array_agg(t.role) filter (where t.per_owner)
      into v_roles, v_per_owner from public.equity_template(v_cls) t;
    for r in select b.* from public.opening_balances b where b.client_id = p_client_id and b.as_of = v_as_of loop
      v_role := public.equity_code_role(r.account_code);
      if left(r.account_code, 1) = '3' and (v_role is null or (v_role <> 'opening_balance_equity' and not (v_role = any (v_roles)))) then
        step := 4; severity := 'error'; code := 'BALANCE_ACCOUNT_NOT_IN_TEMPLATE';
        message := format('La cuenta %s no pertenece a la plantilla %s', r.account_code, v_cls);
        detail := jsonb_build_object('account_code', r.account_code, 'template', v_cls); return next;
      elsif r.owner_id is null and v_role is not null and (
              v_role = any (coalesce(v_per_owner, array[]::text[]))
              or (v_cls in ('partnership','s_corp') and v_role in ('partner_capital','common_stock','apic'))) then
        step := 4; severity := 'error'; code := 'BALANCE_OWNER_REQUIRED';
        message := format('La cuenta %s se captura por dueño; no se acepta un solo total', r.account_code);
        detail := jsonb_build_object('account_code', r.account_code, 'template', v_cls); return next;
      end if;
    end loop;
  end if;

  select coalesce(sum(b.amount), 0) into v_sum from public.opening_balances b
   where b.client_id = p_client_id and b.as_of = v_as_of and public.equity_code_role(b.account_code) = 'opening_balance_equity';
  if v_sum <> 0 then
    step := 4; severity := 'warn'; code := 'OPENING_BALANCE_EQUITY';
    message := 'Hay saldo en Opening Balance Equity: debe reclasificarse'; detail := jsonb_build_object('amount', v_sum); return next;
  end if;
end;
$$;

-- ¿Puede procesar statements? Pasos 1 a 3 sin errores.
create or replace function public.entity_statements_ready(p_client_id uuid)
returns boolean language sql stable as $$
  select not exists (select 1 from public.entity_validate(p_client_id) v where v.step <= 3 and v.severity = 'error')
$$;

-- Alertas del revisor que se pueden evaluar solo con datos de este módulo y nómina (0009).
-- Las que dependen de transacciones (distribuciones fuera de proporción, capital negativo,
-- retiros > utilidad, cambios en años cerrados) las evalúa el motor contable.
create or replace function public.entity_alerts(p_client_id uuid, p_year int)
returns table (code text, message text, detail jsonb)
language plpgsql stable as $$
#variable_conflict use_column
declare
  v_start date := make_date(p_year, 1, 1);
  v_end date := make_date(p_year, 12, 31);
  v_salarios numeric;
  v_obe numeric;
begin
  if exists (
    select 1
    from public.owners o
    join public.tax_classification_periods p
      on p.client_id = o.client_id and p.classification = 's_corp'
     and p.effective_date <= v_end and coalesce(p.period_end, 'infinity'::date) >= v_start
     and o.start_date <= coalesce(p.period_end, 'infinity'::date)
     and coalesce(o.end_date, 'infinity'::date) >= p.effective_date
    where o.client_id = p_client_id and o.is_officer
      and o.start_date <= v_end and coalesce(o.end_date, 'infinity'::date) >= v_start
  ) then
    select coalesce(sum(q.salarios), 0) into v_salarios from public.payroll_quarters q
     where q.client_id = p_client_id and q.anio = p_year;
    if v_salarios <= 0 then
      code := 'S_CORP_OFFICER_NO_PAYROLL';
      message := 'S-corp con oficial dueño y sin sueldo en nómina en el año: revisar sueldo razonable';
      detail := jsonb_build_object('year', p_year, 'salarios', v_salarios); return next;
    end if;
  end if;

  -- Opening Balance Equity con saldo después del alta (hallazgo #6 del piloto)
  if exists (select 1 from public.entity_profile e where e.client_id = p_client_id and e.setup_completed_at is not null) then
    select coalesce(sum(b.amount), 0) into v_obe from public.opening_balances b
     where b.client_id = p_client_id and public.equity_code_role(b.account_code) = 'opening_balance_equity';
    if v_obe <> 0 then
      code := 'OPENING_BALANCE_EQUITY';
      message := 'Saldo en Opening Balance Equity después del alta';
      detail := jsonb_build_object('amount', v_obe); return next;
    end if;
  end if;
end;
$$;

-- ── Triggers de integridad (bloqueos duros por fila) ─────────

create or replace function public.entity_profile_guard()
returns trigger language plpgsql as $$
begin
  -- Cambiar la forma legal no puede dejar clasificaciones inválidas
  if tg_op = 'UPDATE' and new.legal_form is distinct from old.legal_form and exists (
    select 1 from public.tax_classification tc
    where tc.client_id = new.client_id
      and not (tc.classification = any (public.entity_allowed_classifications(new.legal_form)))
  ) then
    raise exception 'La forma legal % no admite la clasificación fiscal ya registrada', new.legal_form
      using errcode = 'check_violation';
  end if;
  -- El alta solo se completa con entity_complete_setup() (que valida antes)
  if new.setup_completed_at is not null
     and (tg_op = 'INSERT' or new.setup_completed_at is distinct from old.setup_completed_at)
     and coalesce(current_setting('gno.completing_setup', true), '') <> '1' then
    raise exception 'El alta se completa con entity_complete_setup()' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists entity_profile_guard on public.entity_profile;
create trigger entity_profile_guard before insert or update on public.entity_profile
  for each row execute function public.entity_profile_guard();

create or replace function public.tax_classification_guard()
returns trigger language plpgsql as $$
declare v_form text;
begin
  select legal_form into v_form from public.entity_profile where client_id = new.client_id;
  if v_form is null then
    raise exception 'Primero registre la estructura corporativa (paso 1)' using errcode = 'check_violation';
  end if;
  if not (new.classification = any (public.entity_allowed_classifications(v_form))) then
    raise exception 'La clasificación % no es válida para la forma legal %', new.classification, v_form
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists tax_classification_guard on public.tax_classification;
create trigger tax_classification_guard before insert or update on public.tax_classification
  for each row execute function public.tax_classification_guard();

-- Si cambia el tipo o la fecha de una elección, sus cuentas de Equity ya no valen: se regeneran.
create or replace function public.tax_classification_reset_accounts()
returns trigger language plpgsql as $$
begin
  if new.classification is distinct from old.classification or new.effective_date is distinct from old.effective_date then
    delete from public.chart_accounts where classification_id = old.id;
  end if;
  return new;
end;
$$;
drop trigger if exists tax_classification_reset_accounts on public.tax_classification;
create trigger tax_classification_reset_accounts after update on public.tax_classification
  for each row execute function public.tax_classification_reset_accounts();

-- S-corp: ningún dueño puede ser una entidad (se evalúa después de escribir, ve el estado final)
create or replace function public.entity_s_corp_check()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.entity_s_corp_entity_owners(new.client_id)) then
    raise exception 'S-corp con un dueño que no es persona física (otra LLC o corporación)'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
drop trigger if exists tax_classification_s_corp_check on public.tax_classification;
create trigger tax_classification_s_corp_check after insert or update on public.tax_classification
  for each row execute function public.entity_s_corp_check();
drop trigger if exists owners_s_corp_check on public.owners;
create trigger owners_s_corp_check after insert or update on public.owners
  for each row execute function public.entity_s_corp_check();

-- La persona, el dueño y el cliente deben coincidir (evita cruzar datos entre clientes)
create or replace function public.owners_guard()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.personas p where p.id = new.persona_id and p.client_id = new.client_id) then
    raise exception 'La persona no pertenece a este cliente' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists owners_guard on public.owners;
create trigger owners_guard before insert or update on public.owners
  for each row execute function public.owners_guard();

create or replace function public.opening_balances_guard()
returns trigger language plpgsql as $$
begin
  if new.owner_id is not null
     and not exists (select 1 from public.owners o where o.id = new.owner_id and o.client_id = new.client_id) then
    raise exception 'El dueño no pertenece a este cliente' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists opening_balances_guard on public.opening_balances;
create trigger opening_balances_guard before insert or update on public.opening_balances
  for each row execute function public.opening_balances_guard();

-- ── Creación de cuentas de Equity ────────────────────────────
-- Recorre el historial de clasificación en orden. Para cada periodo crea las cuentas de
-- su plantilla (una por dueño donde aplica) y fija closed_on = día previo a la siguiente
-- effective_date; la clasificación vigente queda abierta. Idempotente.
-- El asiento de conversión por un cambio de clasificación NO se genera aquí: el capital se
-- reparte entre Common Stock y APIC solo según lo que indique GNO (lo arma el motor contable).
create or replace function public.equity_provision_accounts(p_client_id uuid, p_actor text default null)
returns table (account_id uuid, code text, name_en text, name_es text, role text, persona_id uuid,
               template text, opened_on date, closed_on date, created boolean)
language plpgsql as $$
#variable_conflict use_column
declare
  c record; t record; o record;
  v_err text;
  v_new uuid[] := '{}';
  v_id uuid;
  v_code text;
begin
  select string_agg(v.message, '; ') into v_err
    from public.entity_validate(p_client_id) v where v.step <= 3 and v.severity = 'error';
  if v_err is not null then
    raise exception 'No se pueden crear las cuentas de Equity: %', v_err using errcode = 'check_violation';
  end if;

  for c in
    select p.id, p.classification, p.effective_date, p.period_end
    from public.tax_classification_periods p where p.client_id = p_client_id order by p.effective_date
  loop
    update public.chart_accounts a set closed_on = c.period_end, updated_by = p_actor
     where a.classification_id = c.id and a.closed_on is distinct from c.period_end;

    for t in select * from public.equity_template(c.classification) loop
      if not t.per_owner then
        if not exists (select 1 from public.chart_accounts a where a.classification_id = c.id and a.role = t.role and a.persona_id is null) then
          insert into public.chart_accounts (client_id, classification_id, template, code, name_en, name_es, role, opened_on, closed_on, updated_by)
          values (p_client_id, c.id, c.classification, t.code, t.name_en, t.name_es, t.role, c.effective_date, c.period_end, p_actor)
          returning id into v_id;
          v_new := v_new || v_id;
        end if;
      else
        for o in
          select p.id as persona_id, p.nombre
          from public.owners ow join public.personas p on p.id = ow.persona_id
          where ow.client_id = p_client_id
            and ow.start_date <= coalesce(c.period_end, 'infinity'::date)
            and coalesce(ow.end_date, 'infinity'::date) >= c.effective_date
          group by p.id, p.nombre
          order by min(ow.start_date), min(ow.seq)
        loop
          if not exists (select 1 from public.chart_accounts a where a.classification_id = c.id and a.role = t.role and a.persona_id = o.persona_id) then
            select coalesce(max(a.code::int) + 1, t.code::int)::text into v_code
              from public.chart_accounts a where a.classification_id = c.id and a.role = t.role;
            if v_code::int >= t.code::int + 100 then
              raise exception 'Demasiados dueños para la cuenta base %', t.code;
            end if;
            insert into public.chart_accounts (client_id, classification_id, template, code, name_en, name_es, role, persona_id, opened_on, closed_on, updated_by)
            values (p_client_id, c.id, c.classification, v_code,
                    t.name_en || ' – ' || o.nombre, t.name_es || ' – ' || o.nombre, t.role, o.persona_id,
                    c.effective_date, c.period_end, p_actor)
            returning id into v_id;
            v_new := v_new || v_id;
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  return query
    select a.id, a.code, a.name_en, a.name_es, a.role, a.persona_id, a.template, a.opened_on, a.closed_on, (a.id = any (v_new))
    from public.chart_accounts a where a.client_id = p_client_id
    order by a.opened_on, a.code;
end;
$$;

-- Confirma el alta: valida pasos 1-4, crea las cuentas y marca el cliente como listo.
create or replace function public.entity_complete_setup(p_client_id uuid, p_actor text default null)
returns timestamptz language plpgsql as $$
declare v_err text; v_ts timestamptz := now();
begin
  select string_agg(v.message, '; ') into v_err
    from public.entity_validate(p_client_id) v where v.severity = 'error';
  if v_err is not null then
    raise exception 'No se puede completar el alta: %', v_err using errcode = 'check_violation';
  end if;
  perform 1 from public.equity_provision_accounts(p_client_id, p_actor);
  perform set_config('gno.completing_setup', '1', true);
  update public.entity_profile set setup_completed_at = v_ts, setup_completed_by = p_actor, updated_by = p_actor
   where client_id = p_client_id;
  perform set_config('gno.completing_setup', '', true);
  return v_ts;
end;
$$;

-- ── Guardado atómico por paso (reemplaza el conjunto) ────────
-- Las usa la API del asistente: un paso se guarda completo o no se guarda.

create or replace function public.entity_save_classifications(p_client_id uuid, p_rows jsonb, p_actor text default null)
returns void language plpgsql as $$
declare r jsonb; v_id uuid; v_keep uuid[];
begin
  select coalesce(array_agg((x->>'id')::uuid) filter (where nullif(x->>'id','') is not null), '{}')
    into v_keep from jsonb_array_elements(p_rows) x;
  delete from public.tax_classification where client_id = p_client_id and id <> all (v_keep);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_id := nullif(r->>'id', '')::uuid;
    if v_id is null then
      insert into public.tax_classification (client_id, classification, effective_date, election_form, election_doc, updated_by)
      values (p_client_id, r->>'classification', (r->>'effective_date')::date,
              coalesce(nullif(r->>'election_form',''), 'none'), nullif(r->>'election_doc',''), p_actor);
    else
      update public.tax_classification set
        classification = r->>'classification', effective_date = (r->>'effective_date')::date,
        election_form = coalesce(nullif(r->>'election_form',''), 'none'), election_doc = nullif(r->>'election_doc',''),
        updated_by = p_actor
      where id = v_id and client_id = p_client_id;
      if not found then raise exception 'Clasificación % no encontrada', v_id; end if;
    end if;
  end loop;
end;
$$;

create or replace function public.entity_save_owners(p_client_id uuid, p_rows jsonb, p_actor text default null)
returns void language plpgsql as $$
declare r jsonb; v_id uuid; v_keep uuid[];
begin
  select coalesce(array_agg((x->>'id')::uuid) filter (where nullif(x->>'id','') is not null), '{}')
    into v_keep from jsonb_array_elements(p_rows) x;
  delete from public.owners where client_id = p_client_id and id <> all (v_keep);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_id := nullif(r->>'id', '')::uuid;
    if v_id is null then
      insert into public.owners (client_id, persona_id, role, holder_type, ownership_pct, start_date, end_date, is_officer, updated_by)
      values (p_client_id, (r->>'persona_id')::uuid, r->>'role', coalesce(nullif(r->>'holder_type',''), 'individual'),
              (r->>'ownership_pct')::numeric, (r->>'start_date')::date, nullif(r->>'end_date','')::date,
              coalesce((r->>'is_officer')::boolean, false), p_actor);
    else
      update public.owners set
        persona_id = (r->>'persona_id')::uuid, role = r->>'role',
        holder_type = coalesce(nullif(r->>'holder_type',''), 'individual'),
        ownership_pct = (r->>'ownership_pct')::numeric, start_date = (r->>'start_date')::date,
        end_date = nullif(r->>'end_date','')::date, is_officer = coalesce((r->>'is_officer')::boolean, false),
        updated_by = p_actor
      where id = v_id and client_id = p_client_id;
      if not found then raise exception 'Dueño % no encontrado', v_id; end if;
    end if;
  end loop;
end;
$$;

create or replace function public.entity_save_opening_balances(p_client_id uuid, p_as_of date, p_rows jsonb, p_actor text default null)
returns void language plpgsql as $$
declare r jsonb;
begin
  delete from public.opening_balances where client_id = p_client_id;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.opening_balances (client_id, as_of, account_code, account_name, owner_id, amount, source, updated_by)
    values (p_client_id, p_as_of, r->>'account_code', nullif(r->>'account_name',''), nullif(r->>'owner_id','')::uuid,
            (r->>'amount')::numeric, coalesce(nullif(r->>'source',''), 'GNO'), p_actor);
  end loop;
end;
$$;

-- ── DLP, RLS, permisos, updated_at y bitácora (mismo patrón que 0009/0012) ──
do $$
declare t text; r record;
begin
  foreach t in array array['entity_profile','tax_classification','owners','opening_balances','chart_accounts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role full access" on public.%I', t);
    execute format('create policy "service_role full access" on public.%I for all using (auth.role() = ''service_role'')', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists %I on public.%I', t||'_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t||'_updated_at', t);
    execute format('drop trigger if exists %I on public.%I', t||'_log', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_change()', t||'_log', t);
  end loop;

  for r in select * from (values
    ('tax_classification', array['election_doc']),
    ('opening_balances',   array['account_name']),
    ('chart_accounts',     array['name_en','name_es'])
  ) as x(tabla, cols) loop
    execute format('drop trigger if exists %I on public.%I', r.tabla || '_dlp', r.tabla);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.bloquear_id_en_claro(%s)',
                   r.tabla || '_dlp', r.tabla, (select string_agg(quote_literal(c), ',') from unnest(r.cols) c));
  end loop;
end $$;

revoke all on public.tax_classification_periods from anon, authenticated;

-- Las funciones del módulo solo las ejecuta el servidor (service_role)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'entity_allowed_classifications','equity_code_role','equity_template','entity_classification_on',
      'entity_owner_segments','entity_s_corp_entity_owners','opening_balance_check','entity_validate',
      'entity_statements_ready','entity_alerts','equity_provision_accounts','entity_complete_setup',
      'entity_save_classifications','entity_save_owners','entity_save_opening_balances')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
