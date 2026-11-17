-- ─────────────────────────────────────────────────────────────
-- 0008_security_hardening.sql
-- 1) La policy anon de reports permitía leer TODOS los reportes con token
--    vigente (no comparaba contra el token pedido). /r/[token] lee con
--    service_role desde el servidor, así que anon no necesita acceso.
-- 2) Defensa en profundidad: anon y authenticated sin privilegios sobre
--    las tablas existentes. Todo acceso pasa por el servidor (service_role).
-- ─────────────────────────────────────────────────────────────

drop policy if exists "anon read by valid magic token" on public.reports;

revoke all on public.clients    from anon, authenticated;
revoke all on public.reports    from anon, authenticated;
revoke all on public.email_logs from anon, authenticated;
revoke all on public.sms_logs   from anon, authenticated;

alter table public.sms_logs enable row level security;
drop policy if exists "service_role full access" on public.sms_logs;
create policy "service_role full access" on public.sms_logs
  for all using (auth.role() = 'service_role');
