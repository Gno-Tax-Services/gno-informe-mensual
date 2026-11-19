-- ─────────────────────────────────────────────────────────────
-- 0011_entregas.sql
-- Registro de entregas: qué se entregó, a quién, por qué canal, cuándo,
-- quién lo hizo y dónde quedó guardado en Drive. Los archivos NO se
-- guardan aquí (ver compliance_documents → Drive).
-- Las entregas no se borran ni se editan: una corrección se registra
-- anulando la entrega (anulada_en/motivo) y creando una nueva.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.entregas (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete restrict,
  modulo         text not null check (modulo in ('audit','sales_tax','payroll','informe','otro')),
  entidad        text check (entidad in ('audit','sales_tax_period','payroll_quarter','report')),
  entidad_id     uuid,
  tipo           text not null,          -- p. ej. 'WC audit', 'GL audit', 'LA R-1029', 'Jefferson return', '941', 'L-1', 'SUTA', 'FUTA 940', 'Informe mensual'
  periodo        text,                   -- '2025-10-24/2026-10-24', '2026-10', '2026-Q3'
  destinatario   text not null,          -- carrier, LDR, parroquia, IRS, LWC, cliente
  destinatario_contacto text,            -- correo, portal o dirección
  canal          text not null check (canal in ('email','portal','correo','fax','sms','en_persona','otro')),
  entregado_en   timestamptz not null,   -- hora real de entrega (America/Chicago al mostrar)
  entregado_por  text not null,          -- correo del miembro del equipo
  confirmacion   text,                   -- n.º de confirmación, id del correo, recibo del portal
  monto          numeric(14,2),          -- impuesto pagado o prima, si aplica
  drive_folder_id text,
  drive_folder_url text,
  ubicacion      text,                   -- ruta legible en Drive
  notas          text,
  created_at     timestamptz not null default now(),
  anulada_en     timestamptz,
  anulada_por    text,
  motivo_anulacion text,
  check ((anulada_en is null) = (motivo_anulacion is null))
);
create index if not exists entregas_client_idx on public.entregas(client_id, entregado_en desc);
create index if not exists entregas_entidad_idx on public.entregas(entidad, entidad_id);
create index if not exists entregas_modulo_idx on public.entregas(modulo, entregado_en desc);

-- Documentos que formaron parte de cada entrega (referencias a Drive)
create table if not exists public.entrega_documentos (
  entrega_id   uuid not null references public.entregas(id) on delete restrict,
  documento_id uuid not null references public.compliance_documents(id) on delete restrict,
  primary key (entrega_id, documento_id)
);

-- Solo se permite anular (una vez). Nada más se puede cambiar ni borrar.
create or replace function public.entregas_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las entregas no se borran; anúlela con motivo';
  end if;
  if old.anulada_en is not null then
    raise exception 'La entrega ya está anulada';
  end if;
  if (to_jsonb(new) - array['anulada_en','anulada_por','motivo_anulacion'])
     is distinct from (to_jsonb(old) - array['anulada_en','anulada_por','motivo_anulacion']) then
    raise exception 'Solo se permite anular una entrega';
  end if;
  return new;
end;
$$;
drop trigger if exists entregas_guard on public.entregas;
create trigger entregas_guard before update or delete on public.entregas
  for each row execute function public.entregas_guard();

create or replace function public.entrega_documentos_guard()
returns trigger language plpgsql as $$
begin
  raise exception 'Los documentos de una entrega no se modifican';
end;
$$;
drop trigger if exists entrega_documentos_guard on public.entrega_documentos;
create trigger entrega_documentos_guard before update or delete on public.entrega_documentos
  for each row execute function public.entrega_documentos_guard();

-- Actor en la bitácora: también toma entregado_por / subido_por / anulada_por
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
  values (coalesce(n->>'anulada_por', n->>'updated_by', n->>'entregado_por', n->>'subido_por', o->>'updated_by'), tg_table_name,
          coalesce(n->>'id', n->>'client_id', o->>'id', o->>'client_id'), tg_op,
          case when tg_op = 'UPDATE' then diff end);
  return coalesce(new, old);
end;
$$;

-- Bitácora, RLS y permisos (mismo patrón que 0009)
do $$
declare t text;
begin
  foreach t in array array['entregas','entrega_documentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role full access" on public.%I', t);
    execute format('create policy "service_role full access" on public.%I for all using (auth.role() = ''service_role'')', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
drop trigger if exists entregas_log on public.entregas;
create trigger entregas_log after insert or update on public.entregas
  for each row execute function public.log_change();
drop trigger if exists compliance_documents_log on public.compliance_documents;
create trigger compliance_documents_log after insert or update on public.compliance_documents
  for each row execute function public.log_change();

-- Vista: última entrega vigente por entidad (para el tablero)
create or replace view public.entregas_ultima as
select distinct on (entidad, entidad_id) *
from public.entregas
where anulada_en is null and entidad_id is not null
order by entidad, entidad_id, entregado_en desc;
revoke all on public.entregas_ultima from anon, authenticated;

-- Administradores iniciales (Erika y Berny se agregan con su correo)
insert into public.team_members (email, nombre, rol) values
  ('jeiver@gnotax.com', 'Jeiver Gonzalez', 'admin'),
  ('jgonzalez@gnotbc.com', 'Jeiver Gonzalez (GNO)', 'admin')
on conflict (email) do nothing;
