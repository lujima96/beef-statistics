#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
if [[ ! -f "$ENV_FILE" && -f "$ROOT_DIR/beef_stats/.env" ]]; then
  ENV_FILE="$ROOT_DIR/beef_stats/.env"
fi

SQL_DIR="$ROOT_DIR/sql"
if [[ ! -d "$SQL_DIR" && -d "$ROOT_DIR/beef_stats/sql" ]]; then
  SQL_DIR="$ROOT_DIR/beef_stats/sql"
fi

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-${PG_HOST_PORT:-5432}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-beef_data}}"
PGUSER="${PGUSER:-${POSTGRES_USER:-postgres}}"
PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGPASSWORD

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$SQL_DIR/health_check.sql"
