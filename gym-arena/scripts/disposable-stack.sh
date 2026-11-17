#!/usr/bin/env bash
# DISPOSABLE local Supabase stacks with their own identity — never the development stack
# (project gym-arena, 54321/54322) and never the protected long-lived test stack
# (gym-arena-test, 5632x):
#
#   gym-arena-ci      API 58321, DB 58322   what the CI workflow creates and throws away in every job
#   gym-arena-fresh   API 57321, DB 57322   DISABLED: no local disposable-stack lifecycle (no local
#                                           creation or cleanup); refused for every command
#
# Policy: this script runs only for gym-arena-ci and only when GITHUB_ACTIONS=true. That check is
# ACCIDENT PREVENTION, NOT AUTHENTICATION: GitHub sets the variable on its runners, and anyone
# can set it by hand. It stops an ordinary local invocation from starting or destroying a stack;
# it does not prove a GitHub runner, and the protected stack never depends on it (this script
# cannot address gym-arena-test at all).
#
# Built from the app's own supabase/ folder (same migrations, same seed) into a git-ignored
# work directory (.ci-stack/), with project_id and every port rewritten.
#
# Usage: scripts/disposable-stack.sh gym-arena-ci <command>          (CI only)
#   start        create a NEW stack. Refuses if any container or volume of this project already
#                exists — a stack that already holds data is not fresh. Nothing is deleted.
#   reuse        start the EXISTING stack of this project, data kept (explicit, with a warning)
#   verify       identity report (containers, project label, ports, volume, local JWT secret)
#   env          print the test settings for this stack (stdout; the identity report on stderr)
#   env-github   append the settings to $GITHUB_ENV with the keys masked (CI only)
#   stop         stop the containers, keep the data
#   destroy      stop and delete THIS project's containers and volumes (explicit only)
#
# The authoritative pre-write verification (actual containers + the database reached through
# TEST_DATABASE_URL is the one in the container) is tests/support/stack-identity.ts, run by the
# test runners before any test. This script's checks fail earlier and print nothing secret.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$APP_DIR/node_modules/.bin/supabase"
LOCAL_JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"

die() { echo "disposable-stack: $*" >&2; exit 1; }

PROJECT_ID="${1:-}"
CMD="${2:-}"
case "$PROJECT_ID" in
  gym-arena-fresh) die "gym-arena-fresh is disabled: there is no local disposable-stack lifecycle (no local creation or cleanup). Write-capable tests run in CI." ;;
  gym-arena-ci)    P=58; WORKDIR="$APP_DIR/.ci-stack";    INSPECTOR=8483 ;;
  *) die "usage: scripts/disposable-stack.sh gym-arena-ci <start|reuse|verify|env|env-github|stop|destroy> (CI only)" ;;
esac
# accident prevention, not authentication (see the header)
[ "${GITHUB_ACTIONS:-}" = "true" ] || die "refusing: $PROJECT_ID is managed only inside CI (GITHUB_ACTIONS=true) — no local disposable-stack lifecycle"
API_PORT="${P}321"
DB_PORT="${P}322"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
API_CONTAINER="supabase_kong_${PROJECT_ID}"
DB_VOLUME="supabase_db_${PROJECT_ID}"

generate() {
  mkdir -p "$WORKDIR/supabase"
  rm -rf "$WORKDIR/supabase/migrations"
  cp -r "$APP_DIR/supabase/migrations" "$WORKDIR/supabase/migrations"
  cp "$APP_DIR/supabase/seed.sql" "$WORKDIR/supabase/seed.sql"
  sed -e "s/^project_id = \"gym-arena\"$/project_id = \"$PROJECT_ID\"/" \
      -e "s/^port = 54321$/port = ${P}321/" -e "s/^port = 54322$/port = ${P}322/" \
      -e "s/^shadow_port = 54320$/shadow_port = ${P}320/" -e "s/^port = 54329$/port = ${P}329/" \
      -e "s/^port = 54323$/port = ${P}323/" -e "s/^port = 54324$/port = ${P}324/" \
      -e "s/^port = 54327$/port = ${P}327/" -e "s/^inspector_port = 8083$/inspector_port = $INSPECTOR/" \
      "$APP_DIR/supabase/config.toml" > "$WORKDIR/supabase/config.toml"
}

verify_config() {
  local cfg="$WORKDIR/supabase/config.toml"
  [ -f "$cfg" ] || die "missing $cfg"
  grep -qx "project_id = \"$PROJECT_ID\"" "$cfg" || die "project_id is not $PROJECT_ID"
  grep -qx "port = $API_PORT" "$cfg" || die "API port is not $API_PORT"
  grep -qx "port = $DB_PORT" "$cfg" || die "DB port is not $DB_PORT"
  # no port of the development stack (5432x) or the long-lived test stack (5632x) may remain
  if grep -qE '^(port|shadow_port) = 5[46]32[0-9]$' "$cfg"; then die "config still contains development or test-stack ports"; fi
  [ ! -f "$WORKDIR/supabase/.temp/project-ref" ] || die "$PROJECT_ID is linked to a cloud project"
  [ ! -f "$APP_DIR/supabase/.temp/project-ref" ] || die "the app's Supabase CLI is linked to a cloud project"
  [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] || die "SUPABASE_ACCESS_TOKEN is set — refusing"
  [ -z "${SUPABASE_DB_PASSWORD:-}" ] || die "SUPABASE_DB_PASSWORD is set — refusing"
}

existing() {
  # any container or volume of this project, running or not
  { docker ps -a --filter "label=com.supabase.cli.project=$PROJECT_ID" --format '{{.Names}}'
    docker volume ls --filter "label=com.supabase.cli.project=$PROJECT_ID" --format '{{.Name}}'
    docker volume ls --format '{{.Name}}' | grep -E "_${PROJECT_ID}\$" || true; } | sort -u
}

published() { docker port "$1" "$2" 2>/dev/null | head -n1 | sed -E 's/.*:([0-9]+)$/\1/'; }

verify_running() {
  verify_config
  local c label
  for c in "$DB_CONTAINER" "$API_CONTAINER"; do
    [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = "true" ] || die "container $c is not running"
    label="$(docker inspect -f '{{index .Config.Labels "com.supabase.cli.project"}}' "$c")"
    [ "$label" = "$PROJECT_ID" ] || die "container $c belongs to project '$label', not $PROJECT_ID"
  done
  [ "$(published "$DB_CONTAINER" 5432/tcp)" = "$DB_PORT" ] || die "$DB_CONTAINER does not publish $DB_PORT"
  [ "$(published "$API_CONTAINER" 8000/tcp)" = "$API_PORT" ] || die "$API_CONTAINER does not publish $API_PORT"
  local vol
  vol="$(docker inspect "$DB_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"
  [ "$vol" = "$DB_VOLUME" ] || die "database volume is '$vol', expected $DB_VOLUME"
  local secret
  secret="$(docker exec "$DB_CONTAINER" psql -U postgres -Atc "select current_setting('app.settings.jwt_secret', true)")"
  [ "$secret" = "$LOCAL_JWT_SECRET" ] || die "database is not a local development stack"
  echo "verified: project=$PROJECT_ID containers=$DB_CONTAINER,$API_CONTAINER volume=$vol db_port=$DB_PORT api_port=$API_PORT (local, not linked)" >&2
}

settings() {
  local status api db
  status="$(cd "$WORKDIR" && "$CLI" status --workdir "$WORKDIR" -o env 2>/dev/null)"
  value() { printf '%s\n' "$status" | sed -nE "s/^$1=\"?([^\"]*)\"?$/\1/p" | head -n1; }
  api="$(value API_URL)"; db="$(value DB_URL)"
  [ "$api" = "http://127.0.0.1:$API_PORT" ] || die "API URL is not http://127.0.0.1:$API_PORT"
  case "$db" in *"@127.0.0.1:$DB_PORT/"*) ;; *) die "DB URL does not point at 127.0.0.1:$DB_PORT" ;; esac
  ANON_KEY="$(value ANON_KEY)"; SERVICE_KEY="$(value SERVICE_ROLE_KEY)"; API_URL="$api"; DB_URL="$db"
  [ -n "$ANON_KEY" ] && [ -n "$SERVICE_KEY" ] || die "the stack did not report its keys"
}

print_env() {
  echo "NEXT_PUBLIC_SUPABASE_URL=$API_URL"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY"
  echo "TEST_DATABASE_URL=$DB_URL"
  echo "GYM_ARENA_TEST_STACK=$PROJECT_ID"
  echo "APP_TIMEZONE=Africa/Cairo"
}

case "$CMD" in
  start)
    generate
    verify_config
    found="$(existing)"
    [ -z "$found" ] || die "refusing to call an existing stack fresh — found: $(echo "$found" | tr '\n' ' ')(use 'reuse' to keep its data, or 'destroy' it explicitly first)"
    (cd "$WORKDIR" && "$CLI" start --workdir "$WORKDIR" > /dev/null)
    verify_running
    ;;
  reuse)
    generate
    verify_config
    echo "disposable-stack: WARNING — reusing the existing $PROJECT_ID stack; its data is kept and it is NOT fresh" >&2
    (cd "$WORKDIR" && "$CLI" start --workdir "$WORKDIR" > /dev/null)
    verify_running
    ;;
  verify)
    verify_running
    ;;
  env)
    verify_running
    settings
    print_env
    ;;
  env-github)
    [ -n "${GITHUB_ENV:-}" ] || die "GITHUB_ENV is not set — env-github is for CI only"
    verify_running
    settings
    echo "::add-mask::$ANON_KEY"
    echo "::add-mask::$SERVICE_KEY"
    print_env >> "$GITHUB_ENV"
    echo "settings for $PROJECT_ID exported (values not printed)" >&2
    ;;
  stop)
    verify_config
    (cd "$WORKDIR" && "$CLI" stop --workdir "$WORKDIR")
    ;;
  destroy)
    verify_config
    (cd "$WORKDIR" && "$CLI" stop --no-backup --workdir "$WORKDIR")
    ;;
  *)
    die "unknown command '$CMD'"
    ;;
esac
