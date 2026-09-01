-- ─────────────────────────────────────────────────────────────
-- 0001_clients.sql
-- Tabla de clientes de GNO Tax & Business Center
-- ─────────────────────────────────────────────────────────────

create table if not exists public.clients (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Identidad
  nombre_dueno         text not null,
  nombre_compania      text not null,
  email                text not null unique,

  -- Industria (para comparar con promedios del sector)
  industria            text,           -- e.g. 'construction', 'retail', 'services'
  industry_avg_low     numeric(5,2),   -- % margen bajo del promedio del sector
  industry_avg_high    numeric(5,2),   -- % margen alto del promedio del sector

  -- Estado
  activo               boolean not null default true,
  primer_email_enviado boolean not null default false
);

-- Actualiza updated_at automáticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- RLS: habilitar (la tabla ya tiene RLS activo por la configuración del proyecto)
alter table public.clients enable row level security;

-- Solo el service_role puede leer/escribir (ningún usuario anónimo accede a la lista de clientes)
create policy "service_role full access" on public.clients
  for all using (auth.role() = 'service_role');
