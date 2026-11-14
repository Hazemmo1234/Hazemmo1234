#!/usr/bin/env bash
# Browser tests against the isolated test stack (scripts/test-stack.sh), including the
# @writes tests that create data. The app is built into .next-test with the test stack's
# settings and served on port 3100, so nothing is shared with the development app or DB.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

bash scripts/test-stack.sh reset            # verifies identity and ports first
bash scripts/test-stack.sh env > .test-stack/.env.test
set -a; . .test-stack/.env.test; set +a
case "$NEXT_PUBLIC_SUPABASE_URL" in http://127.0.0.1:56321) ;; *) echo "refusing: not the test stack" >&2; exit 1 ;; esac

export NEXT_DIST_DIR=.next-test E2E_PORT=3100 E2E_ALLOW_WRITES=1
npm run build > .test-stack/build.log 2>&1 || { tail -30 .test-stack/build.log; exit 1; }
npx playwright test --trace off "$@"
