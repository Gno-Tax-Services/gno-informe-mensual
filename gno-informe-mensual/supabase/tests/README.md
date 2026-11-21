# Pruebas de base de datos

Corren contra un Postgres **real** y temporal (nada de mocks): aplican todas las migraciones
(`supabase/migrations/*.sql`, incluida la 0013) sobre una base vacía con los roles de Supabase
(`anon`, `authenticated`, `service_role`) y `auth.role()` simulados, y después cada `*.test.sql`.

```bash
npm run test:db      # requiere Postgres 14+ instalado localmente (usa /usr/lib/postgresql/*/bin o PGBIN=…)
npm test             # reglas, cierre, i18n y consistencia del modo demo (TypeScript)
```

| Archivo | Qué prueba |
| --- | --- |
| `10_rls.test.sql` | RLS activo + policy de `service_role`; `anon`/`authenticated` sin privilegios ni EXECUTE; la policy bloquea aunque se otorgara un GRANT por error; ninguna columna guarda SSN/ITIN/EIN; DLP; bitácora |
| `20_entity_validation.test.sql` | Las 20 combinaciones forma legal × clasificación, suma de % = 100 (incl. cambio de % a mitad de año), número de dueños, S-corp con entidades, cuadre de saldos iniciales, capital por dueño |
| `30_equity_accounts.test.sql` | Plantillas de Equity, una cuenta por dueño, cambio de clasificación (caso 3), alta completa, alertas, guardado atómico |
| `40_demo_seed.test.sql` | `seed/demo.sql` carga limpio, es idempotente y es 100 % ficticio (casos 2 a 5) |

Cada prueba imprime `PASS …`; cualquier aserción fallida aborta con `FALLÓ: …`.
`00_supabase_stub.sql` y `helpers.sql` son utilidades de prueba, no migraciones.
