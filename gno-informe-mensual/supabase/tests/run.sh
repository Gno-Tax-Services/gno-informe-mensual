#!/usr/bin/env bash
# Pruebas de base de datos: levanta un Postgres temporal, aplica las migraciones
# (0001..0013), y corre cada supabase/tests/*.test.sql. Falla si alguna aserción falla.
#   uso: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || { echo "No encuentro Postgres (defina PGBIN)"; exit 2; }

WORK="$(mktemp -d)"; chmod 755 "$WORK"
PORT="${PGPORT_TEST:-54329}"
if [ "$(id -u)" = 0 ]; then RUN=(runuser -u postgres --); chown postgres "$WORK"; else RUN=(); fi
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN[@]}" "$PGBIN/initdb" -D "$WORK/data" -A trust -U postgres >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
PSQL=("$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database t" >/dev/null
PSQL+=(-d t)

"${PSQL[@]}" -f tests/00_supabase_stub.sql >/dev/null
for f in migrations/*.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null 2>"$WORK/err" || { echo "✗ migración $f"; cat "$WORK/err"; exit 1; }
done
echo "✓ migraciones aplicadas"
# Idempotencia: la última migración se puede volver a correr sin error.
last="$(ls migrations/*.sql | tail -1)"
"${PSQL[@]}" -f "$last" >/dev/null 2>"$WORK/err" || { echo "✗ $last no es idempotente"; cat "$WORK/err"; exit 1; }
echo "✓ $last es idempotente"

rc=0
for t in tests/*.test.sql; do
  if "${PSQL[@]}" -f "$t" >"$WORK/out" 2>"$WORK/err"; then
    echo "✓ $t"; echo "    $(grep -c 'PASS' "$WORK/err" || true) aserciones OK"
  else
    echo "✗ $t"; cat "$WORK/err"; rc=1
  fi
done
exit $rc
