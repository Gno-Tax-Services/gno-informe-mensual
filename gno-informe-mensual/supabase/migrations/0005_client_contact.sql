-- ─────────────────────────────────────────────────────────────
-- 0005_client_contact.sql
-- Teléfono e idioma del cliente (vienen del Client List en Drive).
-- idioma: 'Espanol' | 'Ingles' | 'Portugues'
-- ─────────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists telefono text,
  add column if not exists idioma   text;
