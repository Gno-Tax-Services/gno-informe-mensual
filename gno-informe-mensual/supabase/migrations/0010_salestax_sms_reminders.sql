-- ─────────────────────────────────────────────────────────────
-- 0010_salestax_sms_reminders.sql
-- Permite registrar en sms_logs recordatorios que no son del informe
-- mensual (p. ej. sales tax) y evita duplicados por período/etapa.
-- ─────────────────────────────────────────────────────────────
alter table public.sms_logs
  add column if not exists kind    text not null default 'report_reminder',
  add column if not exists periodo date,
  add column if not exists etapa   text;

alter table public.sms_logs drop constraint if exists sms_logs_kind_check;
alter table public.sms_logs add constraint sms_logs_kind_check
  check (kind in ('report_reminder','salestax_reminder'));

-- Un solo SMS de sales tax por teléfono, período y etapa
create unique index if not exists sms_logs_salestax_once
  on public.sms_logs (telefono, periodo, etapa)
  where kind = 'salestax_reminder' and status = 'sent';
