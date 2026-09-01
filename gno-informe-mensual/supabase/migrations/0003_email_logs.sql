-- ─────────────────────────────────────────────────────────────
-- 0003_email_logs.sql
-- Log de emails enviados
-- ─────────────────────────────────────────────────────────────

create table if not exists public.email_logs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- Referencias
  report_id    uuid references public.reports(id) on delete set null,
  client_id    uuid references public.clients(id) on delete set null,

  -- Datos del envío
  to_email     text not null,
  subject      text,
  gmail_message_id text,   -- ID retornado por Gmail API para tracking

  -- Resultado
  status       text not null default 'sent'
    check (status in ('sent','failed','bounced')),
  error_detail text         -- null si status = 'sent'
);

-- Índices
create index email_logs_report_id_idx on public.email_logs(report_id);
create index email_logs_client_id_idx on public.email_logs(client_id);
create index email_logs_created_at_idx on public.email_logs(created_at desc);

-- RLS: solo service_role
alter table public.email_logs enable row level security;

create policy "service_role full access" on public.email_logs
  for all using (auth.role() = 'service_role');
