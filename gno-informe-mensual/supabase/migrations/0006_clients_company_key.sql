-- ─────────────────────────────────────────────────────────────
-- 0006_clients_company_key.sql
-- Un cliente puede tener varias compañías (mismo correo, distintas empresas)
-- y una compañía varios contactos. La clave única correcta es (compañía, correo).
-- ─────────────────────────────────────────────────────────────

-- 1) Limpia filas basura del primer sync mal mapeado.
delete from public.clients where nombre_compania = '(sin nombre)';

-- 2) Cambia la clave única: de "email" a (nombre_compania, email).
alter table public.clients drop constraint if exists clients_email_key;
create unique index if not exists clients_company_email_uk
  on public.clients (nombre_compania, email);
