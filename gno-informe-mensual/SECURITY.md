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

## SSN, ITIN, ATIN y EIN (migración 0012)
- Se guardan en `identificadores`, cifrados con AES-256-GCM (`valor_enc`). En pantallas, APIs, reportes y bitácora solo aparecen los **últimos 4** (`•••-••-1234`, `••-•••1234`).
- `huella` (HMAC-SHA256 con `FIELD_HMAC_KEY`) detecta un número repetido sin descifrarlo, incluso entre clientes.
- Validación de formato antes de cifrar: reglas SSA para SSN, rangos del IRS para ITIN/ATIN, prefijos válidos de EIN.
- **Revelar** el número completo: solo rol admin, motivo obligatorio, máximo 10 por hora por usuario, registro `VIEW_SENSITIVE` en `change_log` antes de mostrarlo, respuesta `no-store`, se oculta sola a los 30 s o al cambiar de pestaña.
- **DLP en la base de datos**: triggers rechazan patrones de SSN/ITIN/EIN escritos en claro en notas, nombres de archivo, ubicación, confirmaciones, etc.
- Errores de la API nunca reenvían el detalle de Postgres.
- Rotación de llaves: `FIELD_ENCRYPTION_KEY_V2` cifra lo nuevo; lo viejo se sigue leyendo con v1 (`needsReencrypt` marca qué re-cifrar).

## Navegador y sesión
- Headers: HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; `/admin` y `/api/compliance` con `no-store` y `noindex`.
- Sesión NextAuth de 8 horas.
- El build falla si hay errores de TypeScript.

## Llaves (Vercel → Environment Variables, solo Production)
| Variable | Uso |
|---|---|
| `FIELD_ENCRYPTION_KEY` | cifrado v1 (`openssl rand -base64 32`) |
| `FIELD_HMAC_KEY` | huella; distinta a la de cifrado (`openssl rand -base64 32`) |
| `FIELD_ENCRYPTION_KEY_V2` | solo al rotar |
Guardar copia de las llaves fuera de Vercel (gestor de contraseñas). Sin la llave, los datos cifrados no se recuperan.

## Instancia DEMO
- Se publica como **otro proyecto de Vercel** (mismo repo) con `GNO_DEMO_MODE=1`, conectado a **otro proyecto de Supabase** con `supabase/seed/demo.sql` (datos ficticios).
- Tres candados: `GNO_DEMO_MODE=1`, `DEMO_PASSWORD` de 12+ caracteres y la tabla `demo_instance` (solo existe en la base demo). Contra la base real el login demo siempre falla.
- En demo no existe el login de Google; el usuario demo es `viewer` (solo lectura).
- El middleware bloquea toda escritura en `/api/*`, los crons, SMS, emails, videos, Drive y los identificadores.
- Banner "DEMO · Datos ficticios · Solo lectura" en todas las páginas.
