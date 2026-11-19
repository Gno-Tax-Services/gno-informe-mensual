# Seguridad — GNO Informe Mensual / Compliance Center

## Principios
1. **Todo acceso a datos pasa por el servidor** con `SUPABASE_SERVICE_ROLE_KEY`. Ninguna tabla es legible por `anon` ni `authenticated`; cada tabla nueva debe llevar RLS + policy `service_role` + `revoke all ... from anon, authenticated` (ver 0009).
2. **Login**: NextAuth + Google, lista blanca en `GNO_ALLOWED_EMAILS`. Roles en `team_members` (admin / staff / viewer).
3. **Identificadores sensibles** (EIN, cuentas LA Revenue, LWC): cifrados en la app con AES-256-GCM (`src/lib/field-crypto.ts`), solo los últimos 4 en claro. Nunca loguear ni mandar a Claude/HeyGen el valor completo.
4. **Documentos** (statements, pólizas, payroll, reportes): viven en Google Drive (GNO Clients). La base de datos guarda solo la referencia (file id, link, ubicación) y el registro de entrega. El service account solo tiene acceso a las carpetas compartidas con él.
5. **Bitácora**: `change_log` es append-only (trigger bloquea UPDATE/DELETE). Registra actor (`updated_by`), tabla, fila y columnas cambiadas; los campos `*_enc` aparecen como `[cifrado]`.
6. **Secretos** solo en Vercel. Nunca en GitHub, `.env.local` está en `.gitignore`.

## Variables nuevas (Vercel → Settings → Environment Variables)
| Variable | Cómo generarla |
|---|---|
| `FIELD_ENCRYPTION_KEY` | `openssl rand -base64 32` — guardar también en un gestor de contraseñas; si se pierde, los campos cifrados no se recuperan |

## Rotación
Si una llave se filtra: rotar `SUPABASE_SERVICE_ROLE_KEY` en Supabase → Settings → API, actualizar Vercel y redeploy.
