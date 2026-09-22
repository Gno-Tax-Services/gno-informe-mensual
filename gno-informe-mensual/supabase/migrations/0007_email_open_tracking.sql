-- Track email opens via tracking pixel
alter table public.email_logs
  add column if not exists opened_at   timestamptz,
  add column if not exists open_count  integer not null default 0;

-- SMS reminder log
create table if not exists public.sms_logs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  client_id     uuid references public.clients(id) on delete set null,
  report_id     uuid references public.reports(id) on delete set null,
  telefono      text not null,
  message       text not null,
  status        text not null default 'sent'
    check (status in ('sent','failed','delivered','undelivered')),
  provider_sid  text,
  error_detail  text
);
