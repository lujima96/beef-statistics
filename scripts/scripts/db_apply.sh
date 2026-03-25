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
psql_run "$SQL_DIR/02_report_dates.sql"
psql_run "$SQL_DIR/05_json_landing.sql"
psql_run "$SQL_DIR/10_boxed_beef.sql"
psql_run "$SQL_DIR/20_trimmings.sql"
psql_run "$SQL_DIR/30_catalog.sql"
psql_run "$SQL_DIR/40_index_report.sql"
psql_run "$SQL_DIR/50_weekly_retail.sql"
psql_run "$SQL_DIR/51_weekly_boxed_beef.sql"
psql_run "$SQL_DIR/60_cow_sheet_exports.sql"
psql_run "$SQL_DIR/61_choice_sheet_exports.sql"
psql_run "$SQL_DIR/62_prime_sheet_exports.sql"
psql_run "$SQL_DIR/63_select_sheet_exports.sql"
psql_run "$SQL_DIR/64_enforce_report_date_fk.sql"
psql_run "$SQL_DIR/65_diesel_prices.sql"
psql_run "$SQL_DIR/66_supply_demand_indices.sql"
psql_run "$SQL_DIR/67_delivery_estimator.sql"
psql_run "$SQL_DIR/70_receipts.sql"
psql_run "$SQL_DIR/71_fuel_receipts_comments.sql"
psql_run "$SQL_DIR/72_maintenance_entries.sql"
psql_run "$SQL_DIR/73_maintenance_report_date_fk.sql"
psql_run "$SQL_DIR/74_route_logs.sql"
psql_run "$SQL_DIR/75_stops_in_route.sql"
psql_run "$SQL_DIR/76_fuel_stops.sql"
psql_run "$SQL_DIR/80_migrations.sql"
psql_run "$SQL_DIR/90_indexes.sql"

echo "Simplified schema applied. For diagnostics, you can run:"
echo "  psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -f $SQL_DIR/health_check.sql"

echo "All SQL applied to $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
