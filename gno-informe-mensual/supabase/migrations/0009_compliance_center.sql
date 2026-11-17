-- ─────────────────────────────────────────────────────────────
-- 0009_compliance_center.sql
-- Esquema del Compliance Center: auditorías WC/GL, sales tax y payroll.
--
-- Reglas de seguridad (aplican a todas las tablas de este archivo):
--  * RLS activo, solo service_role. anon/authenticated sin privilegios.
--  * Identificadores sensibles (EIN, cuentas LA/LWC) se guardan CIFRADOS
--    desde la app (AES-256-GCM, src/lib/field-crypto.ts) + últimos 4 en claro.
--    La llave vive solo en Vercel (FIELD_ENCRYPTION_KEY), nunca en la base.
--  * Documentos en bucket privado; se sirven con signed URLs de corta vida.
--  * Cada cambio queda en change_log (append-only).
-- ─────────────────────────────────────────────────────────────

-- Equipo y roles (la app valida el correo de NextAuth contra esta tabla)
create table if not exists public.team_members (
  email       text primary key check (email = lower(email)),
  nombre      text not null,
  rol         text not null default 'staff' check (rol in ('admin','staff','viewer')),
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Datos sensibles del cliente (1:1 con clients)
create table if not exists public.client_tax_ids (
  client_id   uuid primary key references public.clients(id) on delete cascade,
  ein_enc     text,            -- ciphertext base64 (iv.tag.data)
  ein_last4   text check (ein_last4 ~ '^[0-9]{4}$'),
  servicios   text[] not null default '{}',   -- {'audit','sales_tax','payroll','informe'}
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- ── Auditorías WC / GL ───────────────────────────────────────
create table if not exists public.audits (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete restrict,
  linea           text not null check (linea in ('WC','GL')),
  carrier         text not null,
  poliza          text,
  vigencia_desde  date,
  vigencia_hasta  date,
  fecha_limite    date,
  fecha_extension date,
  estatus         text not null default 'pending_docs'
    check (estatus in ('on_hold','pending_docs','in_progress','review','sent','closed')),
  base_tipo       text check (base_tipo in ('payroll','gross_sales','subcontract_cost')),
  clases          text,
  base_estimada   numeric(14,2),
  base_real       numeric(14,2),
  rate            numeric(10,4),
  rate_por        integer check (rate_por in (100,1000)),
  factor          numeric(8,4),
  cargos_fijos    numeric(12,2),
  prima_minima    numeric(12,2),
  deposito        numeric(12,2),
  resultado       numeric(12,2),   -- + adicional / − crédito
  pagado          boolean,
  asignado_a      text references public.team_members(email),
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text
);
create index if not exists audits_client_idx on public.audits(client_id);
create index if not exists audits_due_idx on public.audits(fecha_limite) where estatus not in ('sent','closed');

-- ── Sales tax ────────────────────────────────────────────────
create table if not exists public.sales_tax_profiles (
  client_id         uuid primary key references public.clients(id) on delete cascade,
  la_cuenta_enc     text,
  la_cuenta_last4   text,
  tasa_estatal      numeric(6,4) default 0.05,
  parroquia         text,
  tasa_parroquia    numeric(6,4),          -- null = exento
  nota_parroquia    text,
  frecuencia_estado    text not null default 'monthly' check (frecuencia_estado in ('monthly','quarterly')),
  frecuencia_parroquia text not null default 'monthly' check (frecuencia_parroquia in ('monthly','quarterly')),
  vendor_comp_estado    numeric(6,4),
  vendor_comp_parroquia numeric(6,4),
  asignado_a        text references public.team_members(email),
  notas             text,
  updated_at        timestamptz not null default now(),
  updated_by        text
);

create table if not exists public.sales_tax_periods (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id) on delete restrict,
  periodo            date not null check (extract(day from periodo) = 1),  -- primer día del mes
  ventas_brutas      numeric(14,2),
  ventas_exentas     numeric(14,2),
  deducciones        numeric(14,2),
  impuesto_estado    numeric(12,2),
  impuesto_parroquia numeric(12,2),
  multa_estado       numeric(12,2),
  multa_parroquia    numeric(12,2),
  estatus            text not null default 'pending_docs'
    check (estatus in ('pending_docs','in_progress','review','filed','paid')),
  confirmacion_estado    text,
  confirmacion_parroquia text,
  presentado_por     text,
  presentado_en      timestamptz,
  notas              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         text,
  unique (client_id, periodo)
);

-- ── Payroll ──────────────────────────────────────────────────
create table if not exists public.payroll_profiles (
  client_id        uuid primary key references public.clients(id) on delete cascade,
  la_wh_cuenta_enc text,
  la_wh_last4      text,
  lwc_cuenta_enc   text,
  lwc_last4        text,
  tasa_suta        numeric(6,4),
  depositante      text not null default 'monthly' check (depositante in ('monthly','semiweekly','annual_944')),
  asignado_a       text references public.team_members(email),
  notas            text,
  updated_at       timestamptz not null default now(),
  updated_by       text
);

create table if not exists public.payroll_quarters (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete restrict,
  anio           integer not null check (anio between 2020 and 2100),
  trimestre      integer not null check (trimestre between 1 and 4),
  empleados      integer,
  salarios       numeric(14,2),   -- 941 L2
  fed_wh         numeric(14,2),   -- L3
  ss_salarios    numeric(14,2),   -- L5a
  ss_propinas    numeric(14,2),   -- L5b
  med_salarios   numeric(14,2),   -- L5c
  med_adicional  numeric(14,2),   -- L5d
  ajuste_centavos numeric(10,2),  -- L7
  ajuste_propinas numeric(10,2),  -- L9
  creditos       numeric(12,2),   -- L11
  depositos      numeric(14,2),   -- L13
  mes1 numeric(14,2), mes2 numeric(14,2), mes3 numeric(14,2),  -- L16
  la_wh          numeric(12,2),
  la_depositos   numeric(12,2),
  suta_salarios  numeric(14,2),
  tasa_suta      numeric(6,4),
  futa_salarios  numeric(14,2),
  futa_depositos numeric(12,2),
  estatus        text not null default 'pending_docs'
    check (estatus in ('pending_docs','in_progress','review','filed')),
  notas          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text,
  unique (client_id, anio, trimestre)
);

-- ── Documentos (metadatos; el archivo vive en Storage privado) ──
create table if not exists public.compliance_documents (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete restrict,
  entidad       text not null check (entidad in ('audit','sales_tax_period','payroll_quarter','client')),
  entidad_id    uuid,
  storage_path  text not null unique,     -- compliance-docs/<client_id>/<uuid>-<nombre>
  nombre        text not null,
  mime          text,
  bytes         bigint check (bytes <= 52428800),
  subido_por    text not null,
  created_at    timestamptz not null default now(),
  borrado_en    timestamptz                -- soft delete
);
create index if not exists compliance_documents_entidad_idx on public.compliance_documents(entidad, entidad_id);

-- ── Bitácora de cambios (append-only) ─────────────────────────
create table if not exists public.change_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       text,
  tabla       text not null,
  fila_id     text,
  operacion   text not null check (operacion in ('INSERT','UPDATE','DELETE','VIEW_SENSITIVE','DOWNLOAD')),
  cambios     jsonb
);

create or replace function public.change_log_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'change_log es append-only';
end;
$$;
drop trigger if exists change_log_no_update on public.change_log;
create trigger change_log_no_update before update or delete on public.change_log
  for each row execute function public.change_log_block_mutation();

-- Registra qué columnas cambiaron, sin copiar valores cifrados.
create or replace function public.log_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  diff jsonb := '{}'::jsonb;
  k text;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at') and (n->k) is distinct from (o->k) then
        diff := diff || jsonb_build_object(k, case when k like '%\_enc' then '"[cifrado]"'::jsonb else n->k end);
      end if;
    end loop;
  end if;
  insert into public.change_log(actor, tabla, fila_id, operacion, cambios)
  values (coalesce(n->>'updated_by', o->>'updated_by'), tg_table_name,
          coalesce(n->>'id', n->>'client_id', o->>'id', o->>'client_id'), tg_op,
          case when tg_op = 'UPDATE' then diff end);
  return coalesce(new, old);
end;
$$;

-- updated_at + bitácora + RLS en todas las tablas nuevas
do $$
declare t text;
begin
  foreach t in array array['client_tax_ids','audits','sales_tax_profiles','sales_tax_periods',
                           'payroll_profiles','payroll_quarters','compliance_documents',
                           'team_members','change_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role full access" on public.%I', t);
    execute format('create policy "service_role full access" on public.%I for all using (auth.role() = ''service_role'')', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;

  foreach t in array array['client_tax_ids','audits','sales_tax_profiles','sales_tax_periods',
                           'payroll_profiles','payroll_quarters'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t||'_updated_at', t);
    execute format('drop trigger if exists %I on public.%I', t||'_log', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_change()', t||'_log', t);
  end loop;
end $$;

-- ── Storage: bucket privado para documentos ───────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compliance-docs', 'compliance-docs', false, 52428800,
        array['application/pdf','image/png','image/jpeg','text/csv','text/plain',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel','application/zip'])
on conflict (id) do update set public = false;
-- Sin policies en storage.objects para este bucket: solo service_role (que
-- ignora RLS) sube y firma URLs. anon/authenticated no pueden listar ni leer.
