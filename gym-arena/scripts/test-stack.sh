#!/usr/bin/env bash
# Dedicated, disposable LOCAL Supabase stack for tests: project "gym-arena-test",
# API 56321, DB 56322. It is generated from the app's own supabase/ folder (same
# migrations, same seed) into the git-ignored .test-stack/ directory, so there is
# exactly one source of truth for the schema.
#
# Usage: scripts/test-stack.sh start | reset | verify | stop | env
#
# Safety: every reset first verifies the project identity, ports, container names and
# that the Supabase CLI is not linked to any cloud project. It never touches the
# development stack (gym-arena, 54321/54322) or any other stack.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$APP_DIR/.test-stack"
PROJECT_ID="gym-arena-test"
API_PORT=56321
DB_PORT=56322
DB_CONTAINER="supabase_db_${PROJECT_ID}"
CLI="$APP_DIR/node_modules/.bin/supabase"

die() { echo "test-stack: $*" >&2; exit 1; }

generate() {
  mkdir -p "$WORKDIR/supabase"
  rm -rf "$WORKDIR/supabase/migrations"
  cp -r "$APP_DIR/supabase/migrations" "$WORKDIR/supabase/migrations"
  cp "$APP_DIR/supabase/seed.sql" "$WORKDIR/supabase/seed.sql"
  sed -e 's/^project_id = "gym-arena"$/project_id = "gym-arena-test"/' \
      -e 's/^port = 54321$/port = 56321/' -e 's/^port = 54322$/port = 56322/' \
      -e 's/^shadow_port = 54320$/shadow_port = 56320/' -e 's/^port = 54329$/port = 56329/' \
      -e 's/^port = 54323$/port = 56323/' -e 's/^port = 54324$/port = 56324/' \
      -e 's/^port = 54327$/port = 56327/' -e 's/^inspector_port = 8083$/inspector_port = 8283/' \
      "$APP_DIR/supabase/config.toml" > "$WORKDIR/supabase/config.toml"
}

verify_config() {
  local cfg="$WORKDIR/supabase/config.toml"
  [ -f "$cfg" ] || die "missing $cfg"
  grep -qx 'project_id = "gym-arena-test"' "$cfg" || die "project_id is not gym-arena-test"
  grep -qx 'port = 56321' "$cfg" || die "API port is not 56321"
  grep -qx 'port = 56322' "$cfg" || die "DB port is not 56322"
  if grep -qE '^port = 5432[0-9]$|^shadow_port = 5432[0-9]$' "$cfg"; then die "config still contains development-stack ports"; fi
  [ ! -f "$WORKDIR/supabase/.temp/project-ref" ] || die "test stack is linked to a cloud project"
  [ ! -f "$APP_DIR/supabase/.temp/project-ref" ] || die "the app's Supabase CLI is linked to a cloud project"
  [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] || die "SUPABASE_ACCESS_TOKEN is set — refusing"
  [ -z "${SUPABASE_DB_PASSWORD:-}" ] || die "SUPABASE_DB_PASSWORD is set — refusing"
}

verify_running() {
  verify_config
  docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || die "container $DB_CONTAINER not found"
  local port
  port="$(docker port "$DB_CONTAINER" 5432/tcp | head -n1 | sed -E 's/.*:([0-9]+)$/\1/')"
  [ "$port" = "$DB_PORT" ] || die "$DB_CONTAINER publishes port $port, expected $DB_PORT"
  local secret
  secret="$(docker exec "$DB_CONTAINER" psql -U postgres -Atc "select current_setting('app.settings.jwt_secret', true)")"
  [ "$secret" = "super-secret-jwt-token-with-at-least-32-characters-long" ] || die "database is not a local development stack"
  echo "verified: project=$PROJECT_ID container=$DB_CONTAINER db_port=$DB_PORT api_port=$API_PORT (local, not linked)"
}

case "${1:-}" in
  start)
    generate
    verify_config
    (cd "$WORKDIR" && "$CLI" start --workdir "$WORKDIR" > /dev/null)
    verify_running
    ;;
  reset)
    generate
    verify_running # identity, ports and link state are checked BEFORE any reset
    (cd "$WORKDIR" && "$CLI" db reset --workdir "$WORKDIR" 2>&1 | grep -E "Applying|Seeding|Finished|ERROR" || true)
    verify_running
    ;;
  verify)
    verify_running
    ;;
  stop)
    verify_config
    (cd "$WORKDIR" && "$CLI" stop --workdir "$WORKDIR")
    ;;
  env)
    # Settings for pointing tests and the test app build at this stack (local demo keys only).
    verify_config
    status="$(cd "$WORKDIR" && "$CLI" status --workdir "$WORKDIR" -o env 2>/dev/null)"
    value() { printf '%s\n' "$status" | sed -nE "s/^$1=\"?([^\"]*)\"?$/\1/p" | head -n1; }
    api="$(value API_URL)"; db="$(value DB_URL)"
    case "$api" in "http://127.0.0.1:$API_PORT") ;; *) die "API URL is $api, expected http://127.0.0.1:$API_PORT" ;; esac
    case "$db" in *"@127.0.0.1:$DB_PORT/"*) ;; *) die "DB URL does not point at port $DB_PORT" ;; esac
    cat <<ENV
NEXT_PUBLIC_SUPABASE_URL=$api
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(value ANON_KEY)
SUPABASE_SERVICE_ROLE_KEY=$(value SERVICE_ROLE_KEY)
TEST_DATABASE_URL=$db
GYM_ARENA_TEST_STACK=$PROJECT_ID
TEST_DB_ISOLATED=1
E2E_ALLOW_WRITES=1
APP_TIMEZONE=Africa/Cairo
ENV
    ;;
  *)
    die "usage: scripts/test-stack.sh start|reset|verify|stop|env"
    ;;
esac
