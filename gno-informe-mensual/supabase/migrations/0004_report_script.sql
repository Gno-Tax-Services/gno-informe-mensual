-- ─────────────────────────────────────────────────────────────
-- 0004_report_script.sql
-- Guion (script) del video mensual generado con Claude API.
-- ─────────────────────────────────────────────────────────────

alter table public.reports
  add column if not exists script                 text,
  add column if not exists script_generated_at    timestamptz;
