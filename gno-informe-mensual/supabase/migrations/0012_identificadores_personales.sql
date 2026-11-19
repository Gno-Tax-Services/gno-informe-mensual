-- ─────────────────────────────────────────────────────────────
-- 0012_identificadores_personales.sql
-- SSN / ITIN / ATIN de personas (dueños, oficiales, empleados,
-- contratistas, cónyuges, dependientes) y EIN, siempre cifrados.
--  * valor_enc: AES-256-GCM (la llave vive solo en Vercel).
--  * last4: lo único visible en pantallas y reportes.
--  * huella: HMAC para detectar duplicados sin descifrar.
--  * Ver el número completo = acción "revelar": solo admin, con motivo,
--    queda en change_log como VIEW_SENSITIVE.
--  * DLP: la base rechaza SSN/ITIN/EIN escritos en claro en notas,
--    nombres de archivo, confirmaciones, etc.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.personas (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete restrict,
  nombre      text not null,
  rol         text not null check (rol in ('owner','officer','employee','contractor','spouse','dependent','otro')),
  activo      boolean not null default true,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists personas_client_idx on public.personas(client_id);

create table if not exists public.identificadores (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete restrict,
  persona_id   uuid references public.personas(id) on delete restrict,
  tipo         text not null check (tipo in ('SSN','ITIN','ATIN','EIN')),
  valor_enc    text not null check (valor_enc ~ '^v[0-9]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$'),
  last4        text not null check (last4 ~ '^[0-9]{4}$'),
  huella       text not null check (huella ~ '^[0-9a-f]{64}$'),
  key_version  text not null default 'v1',
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   text,
  -- SSN/ITIN/ATIN pertenecen a una persona; EIN al negocio
  check ((tipo = 'EIN') = (persona_id is null))
);
-- Un mismo número no se carga dos veces (aunque sea en otro cliente)
create unique index if not exists identificadores_huella_unq on public.identificadores(tipo, huella) where activo;
create index if not exists identificadores_persona_idx on public.identificadores(persona_id);

-- Las demás columnas *_last4 también deben ser exactamente 4 dígitos
alter table public.sales_tax_profiles drop constraint if exists sales_tax_profiles_last4_chk;
alter table public.sales_tax_profiles add constraint sales_tax_profiles_last4_chk check (la_cuenta_last4 is null or la_cuenta_last4 ~ '^[0-9]{4}$');
alter table public.payroll_profiles drop constraint if exists payroll_profiles_last4_chk;
alter table public.payroll_profiles add constraint payroll_profiles_last4_chk
  check ((la_wh_last4 is null or la_wh_last4 ~ '^[0-9]{4}$') and (lwc_last4 is null or lwc_last4 ~ '^[0-9]{4}$'));

-- ── DLP: no se permiten números de identificación en texto libre ──
-- Detecta 123-45-6789, 123 45 6789, 12-3456789 y 9 dígitos seguidos.
create or replace function public.contiene_id_en_claro(t text)
returns boolean language sql immutable as $$
  select t is not null and (
       t ~ '(^|[^0-9])[0-9]{3}[- .][0-9]{2}[- .][0-9]{4}([^0-9]|$)'
    or t ~ '(^|[^0-9])[0-9]{2}-[0-9]{7}([^0-9]|$)'
    or t ~ '(^|[^0-9])[0-9]{9}([^0-9]|$)'
  );
$$;

create or replace function public.bloquear_id_en_claro()
returns trigger language plpgsql as $$
declare
  col text;
  val text;
  j jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    val := j ->> col;
    if public.contiene_id_en_claro(val) then
      raise exception 'Parece un SSN/ITIN/EIN en claro en %.%: use el campo cifrado (solo últimos 4 en texto)', tg_table_name, col
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

do $$
declare r record;
begin
  for r in select * from (values
    ('personas',             array['nombre','notas']),
    ('audits',               array['notas','poliza']),
    ('sales_tax_profiles',   array['notas','nota_parroquia']),
    ('sales_tax_periods',    array['notas']),
    ('payroll_profiles',     array['notas']),
    ('payroll_quarters',     array['notas']),
    ('compliance_documents', array['nombre','ubicacion']),
    ('entregas',             array['notas','tipo','periodo','destinatario_contacto','ubicacion','motivo_anulacion'])
  ) as x(tabla, cols) loop
    execute format('drop trigger if exists %I on public.%I', r.tabla || '_dlp', r.tabla);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.bloquear_id_en_claro(%s)',
                   r.tabla || '_dlp', r.tabla, (select string_agg(quote_literal(c), ',') from unnest(r.cols) c));
  end loop;
end $$;

-- ── RLS, permisos, updated_at y bitácora (mismo patrón que 0009) ──
do $$
declare t text;
begin
  foreach t in array array['personas','identificadores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role full access" on public.%I', t);
    execute format('create policy "service_role full access" on public.%I for all using (auth.role() = ''service_role'')', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists %I on public.%I', t||'_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t||'_updated_at', t);
    execute format('drop trigger if exists %I on public.%I', t||'_log', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_change()', t||'_log', t);
  end loop;
end $$;

-- La huella tampoco se copia a la bitácora
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
        diff := diff || jsonb_build_object(k,
          case when k like '%\_enc' or k = 'huella' then '"[cifrado]"'::jsonb else n->k end);
      end if;
    end loop;
  end if;
  insert into public.change_log(actor, tabla, fila_id, operacion, cambios)
  values (coalesce(n->>'anulada_por', n->>'updated_by', n->>'entregado_por', n->>'subido_por', o->>'updated_by'), tg_table_name,
          coalesce(n->>'id', n->>'client_id', o->>'id', o->>'client_id'), tg_op,
          case when tg_op = 'UPDATE' then diff end);
  return coalesce(new, old);
end;
$$;

-- Nadie fuera del servidor puede leer la bitácora
revoke all on public.change_log from anon, authenticated;
