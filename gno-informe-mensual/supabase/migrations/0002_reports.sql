-- ─────────────────────────────────────────────────────────────
-- 0002_reports.sql
-- Tabla de reportes mensuales
-- ─────────────────────────────────────────────────────────────

create table if not exists public.reports (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Relación con cliente
  client_id               uuid not null references public.clients(id) on delete cascade,

  -- Periodo del reporte (e.g. "Julio 2026")
  periodo                 text not null,

  -- Métricas financieras del mes
  total_income            numeric(14,2),
  total_cogs              numeric(14,2),
  gross_profit            numeric(14,2),
  total_expenses          numeric(14,2),
  net_income              numeric(14,2),
  profit_margin           numeric(6,2),   -- % calculado

  -- Clasificación vs promedio de industria
  -- 'BELOW_AVERAGE' | 'WITHIN_AVERAGE' | 'ABOVE_AVERAGE'
  profitability_band      text check (profitability_band in ('BELOW_AVERAGE','WITHIN_AVERAGE','ABOVE_AVERAGE')),

  -- Top COGS y Admin para el script (JSON arrays)
  -- e.g. [{"name":"Materials","amount":45000},{"name":"Labor","amount":38000}]
  top_cogs                jsonb,
  top_admin               jsonb,

  -- HeyGen video
  video_url               text,
  heygen_video_id         text,
  video_status            text default 'pending',  -- pending | processing | ready | error

  -- Magic link para acceso del cliente
  magic_token             text unique,
  magic_token_expires_at  timestamptz,

  -- Estado del reporte
  status                  text not null default 'draft'  -- draft | ready | sent
    check (status in ('draft','ready','sent'))
);

create trigger reports_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- Índices para búsquedas frecuentes
create index reports_client_id_idx      on public.reports(client_id);
create index reports_magic_token_idx    on public.reports(magic_token) where magic_token is not null;
create index reports_periodo_idx        on public.reports(periodo);

-- RLS
alter table public.reports enable row level security;

-- Service role: acceso completo
create policy "service_role full access" on public.reports
  for all using (auth.role() = 'service_role');

-- Acceso anónimo: solo con magic token válido y no expirado
-- (usado por la página pública /r/[token])
create policy "anon read by valid magic token" on public.reports
  for select using (
    auth.role() = 'anon'
    and magic_token is not null
    and magic_token_expires_at > now()
  );
