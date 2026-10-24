#!/bin/sh
# Hearbor container entrypoint — boots an ephemeral PostgreSQL for the
# social/gamification API (Prisma), syncs the schema, then starts Express.
# The DB is provisioned on demand (identity bridge + content upserts), so an
# empty database after a redeploy is expected and harmless.
set -e

PG_VER=$(ls /usr/lib/postgresql | head -1)
PG_BIN="/usr/lib/postgresql/$PG_VER/bin"
PG_DATA=/var/lib/blackx-pg

mkdir -p /var/run/postgresql
chown -R postgres:postgres /var/run/postgresql

if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo "🐘 initializing ephemeral postgres…"
  mkdir -p "$PG_DATA"
  chown -R postgres:postgres "$PG_DATA"
  su postgres -c "$PG_BIN/initdb -D $PG_DATA -U postgres" >/dev/null
  {
    echo "shared_buffers = 32MB"
    echo "max_connections = 40"
    echo "unix_socket_directories = '/var/run/postgresql'"
  } >> "$PG_DATA/postgresql.conf"
fi

su postgres -c "$PG_BIN/pg_ctl -D $PG_DATA -l /tmp/blackx-pg.log start" >/dev/null 2>&1 || true
sleep 1
su postgres -c "$PG_BIN/psql -U postgres -tc \"SELECT 1 FROM pg_database WHERE datname='blackx'\"" | grep -q 1 \
  || su postgres -c "$PG_BIN/psql -U postgres -c \"CREATE DATABASE blackx\"" >/dev/null

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres@localhost:5432/blackx}"
echo "🗄 DATABASE_URL set — syncing schema…"
npx prisma db push --skip-generate --accept-data-loss >/dev/null 2>&1 \
  || echo "⚠ prisma db push skipped (client not generated?)"

exec "$@"
