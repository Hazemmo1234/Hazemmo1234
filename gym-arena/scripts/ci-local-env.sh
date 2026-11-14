#!/usr/bin/env bash
# Exports the LOCAL Supabase stack's settings to the GitHub Actions environment.
# Values are masked and never echoed. Refuses anything that is not localhost.
set -euo pipefail

status="$(npx supabase status -o env 2>/dev/null)"
value() { printf '%s\n' "$status" | sed -nE "s/^$1=\"?([^\"]*)\"?$/\1/p" | head -n1; }

api_url="$(value API_URL)"
db_url="$(value DB_URL)"
anon_key="$(value ANON_KEY)"
service_key="$(value SERVICE_ROLE_KEY)"

case "$api_url" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refusing: Supabase API is not a local stack" >&2; exit 1 ;;
esac
case "$db_url" in
  postgresql://*@127.0.0.1:*|postgresql://*@localhost:*) ;;
  *) echo "Refusing: database is not a local stack" >&2; exit 1 ;;
esac
for v in "$anon_key" "$service_key"; do
  [ -n "$v" ] || { echo "Local stack did not report its keys" >&2; exit 1; }
  echo "::add-mask::$v"
done

{
  echo "NEXT_PUBLIC_SUPABASE_URL=$api_url"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon_key"
  echo "SUPABASE_SERVICE_ROLE_KEY=$service_key"
  echo "TEST_DATABASE_URL=$db_url"
  echo "APP_TIMEZONE=Africa/Cairo"
} >> "${GITHUB_ENV:?GITHUB_ENV is not set — this script is for CI only}"
echo "Local stack settings exported."
