#!/usr/bin/env bash
set -euo pipefail

# Apply the project SQL files to a Postgres database.
# Reads connection defaults from .env (or beef_stats/.env in legacy layout)

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

psql_run() {
  local file="$1"
  echo "Applying: ${file#$ROOT_DIR/}"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$file"
}

psql_run "$SQL_DIR/00_schema.sql"
psql_run "$SQL_DIR/01_types.sql"
psql_run "$SQL_DIR/05_json_landing.sql"
psql_run "$SQL_DIR/10_boxed_beef.sql"
psql_run "$SQL_DIR/20_trimmings.sql"
psql_run "$SQL_DIR/30_catalog.sql"
psql_run "$SQL_DIR/40_index_report.sql"
psql_run "$SQL_DIR/50_weekly_retail.sql"
psql_run "$SQL_DIR/51_weekly_boxed_beef.sql"

echo "Simplified schema applied. For diagnostics, you can run:"
echo "  psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -f $SQL_DIR/health_check.sql"

echo "All SQL applied to $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
