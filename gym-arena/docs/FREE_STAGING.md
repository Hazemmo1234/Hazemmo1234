# Free staging — Netlify Free + Supabase Free (no payment, no card)

Purpose: run a **staging** copy of Gym Arena for real-device acceptance at **zero cost**, without
changing the product or production plans. Production hosting is a separate decision
(`DEPLOYMENT.md`, `PRODUCTION_RUNBOOK.md`).

Status: **prepared, not executed.** Every cloud step below needs the owner's account and an explicit
approval (§6). Nothing in this document has been run against a cloud service.

## 1. Why not Vercel Hobby, and why Netlify Free

| Option | Commercial use on the free plan | What happens at the free limit | Fits Gym Arena staging |
|---|---|---|---|
| **Vercel Hobby** | **No.** Vercel's terms (§4, checked 2026-11-24): Hobby is "for your personal or non-commercial use". A gym's tool is commercial use. | — | Not permitted |
| **Netlify Free** | **Yes.** Netlify states the Free plan has no commercial-use restriction (netlify.com, "Web apps", checked 2026-11-25). | Hard limit of **300 credits / month**, "You'll never be charged for the Free plan"; projects **pause** until the next month (docs.netlify.com, credit-based pricing plans). | **Recommended** |
| Render Free | Not restricted in the terms found, but Render's docs say free instances are not for production. | One service, 750 h / month; **sleeps after 15 min** without traffic (about 1 min to wake). | Possible fallback; slow first load each morning |
| Cloudflare Workers Free | Allowed | **10 ms CPU per request** on Free; a server-rendered Next.js page is likely to exceed it. | Not suitable without the paid plan |

Netlify runs Next.js through its open-source OpenNext adapter: App Router, middleware (as Edge
Functions), route handlers and server rendering (as Node.js functions) are listed as fully supported
for Next.js 13.5 and later (docs.netlify.com, Next.js overview, 2026-11-25).

**Database: Supabase Free** (already planned in `STAGING.md`): 500 MB database, 5 GB egress,
no backups, and the project **pauses after 7 days without activity** (restorable). No card needed.
It is never upgraded as part of this plan.

## 2. Credit budget on Netlify Free (estimate — check the Usage page during staging)

Netlify Free prices (2026-11-25): production deploy 15 credits · web requests 2 credits / 10,000 ·
functions compute 10 credits / GB-hour · bandwidth 20 credits / GB.

Measured locally: one TV poll returns 11.3 KB (2.1 KB compressed) for 40 members. Assumed (to be
measured on Netlify): 0.3 s and 1 GB per function call.

| Month of staging use | Requests | Compute | Bandwidth | Deploys | **Total** |
|---|---|---|---|---|---|
| TV on **2 h/day** during tests, staff testing, 6 deploys | ≈ 5 | ≈ 20 | ≈ 3 | 90 | **≈ 120** |
| TV on **14 h/day** (like a real gym), staff testing, 6 deploys | ≈ 32 | ≈ 130 | ≈ 8 | 90 | **≈ 260** |

So: staging fits, but a TV left on all day plus many deploys approaches the 300-credit cap. At the
cap the site **pauses** (no charge). Keep the TV on only during test sessions, batch fixes into few
deploys, and read Netlify → Usage after day 1.

## 3. What stays exactly as in `STAGING.md`

Steps 1–6 and 8 are unchanged and provider-independent:
1. create the staging Supabase project (Free), 2. fill `.env.staging`, 3. `npm run staging:preflight`,
4. `npm run staging:migrate` (approval gate G2), 5. enable the restricted close role (Transaction
pooler, port 6543), 6. `npm run staging:create-admin`, 8. `npm run staging:verify -- https://<site>`.

Only **step 7 (hosting)** changes: Netlify instead of Vercel (§4).

## 4. Netlify steps (replaces STAGING.md step 7)

Owner actions (Claude never enters these): sign-up, GitHub authorization, and typing the secrets.

1. Sign up at netlify.com with GitHub (free; no card). **Stop here and tell Claude** if the sign-up
   asks for payment details — that is not the free plan.
2. **Add new project → Import an existing project → GitHub →** `Hazemmo1234/Hazemmo1234`.
   Authorize only this repository if asked.
3. Build settings:
   - Branch to deploy: `claude/ecstatic-goodall-3p1zte` (PR #1 does **not** need to be merged)
   - Base directory: `gym-arena`
   - Build command: `npm run build` · Publish directory: `.next` (the Next.js runtime is detected
     automatically)
   - Environment variable `NODE_VERSION` = `22`
4. Environment variables (Project configuration → Environment variables; mark the secret ones as
   containing secret values; scope: Builds, Functions, Runtime). Copy from `.env.staging` after the
   preflight passed — never from production:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | staging project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | staging service-role key (secret) |
   | `SEASON_CLOSE_DATABASE_URL` | close-role URL, Transaction pooler, port 6543 (secret) |
   | `CRON_SECRET` | from `.env.staging` (secret; the job route stays closed without it) |

   Do **not** set `APP_ORIGIN` (optional in staging), `NEXT_DIST_DIR`, `NODE_ENV`, `VERCEL`,
   `AUTH_COOKIES_ALLOW_LOCAL_HTTP`, or any `STAGING_MIGRATION_*`, `PRODUCTION_*`, `ADMIN_*` value.
5. Deploy. The address is `https://<name>.netlify.app` (no domain purchase).
6. Run `npm run staging:verify -- https://<name>.netlify.app` (read-only; prints no values).

Behaviour on Netlify, checked against the code:
- **Auth cookies are Secure**: a production build never allows the local-HTTP exception
  (`src/lib/supabase/cookie-security.ts`); `VERCEL=1` is not needed.
- **Daily rank snapshot**: the Vercel cron in `vercel.json` does not run on Netlify. The TV's first
  request each day writes the snapshot (`src/modules/tv/state.ts`), so movement arrows still work
  while the TV is used. STAGING.md checklist item 39 becomes: after the TV ran on a day, the
  snapshot for that day exists (`npm run staging:psql`, read-only query).
- **Season close** reaches Supabase through the Transaction pooler from a Node.js function, as
  designed (D27).
- **Not yet proven on Netlify**: the build itself (an offline Netlify build was not run locally),
  `experimental.globalNotFound` (branded 404) under the adapter, and function latency to the
  Supabase region. These are the first three checks after the first deploy; if the 404 page falls
  back to the default one, nothing else is affected.

## 5. Staging acceptance

Follow `STAGING.md` §2 (D1–D3) and `TV_TEST_CHECKLIST.md` on the **real iPad, phone and gym TV**,
with **fictitious members only** — no real gym member data in staging.

## 6. Approval gates (Claude stops before each)

| Gate | Action | Who | Cost | Data |
|---|---|---|---|---|
| G1 | Create the Supabase **Free** staging project | owner (account) | none | new, empty |
| G2 | Apply migrations to staging (`npm run staging:migrate`) | Claude or owner, **after approval** | none | staging only |
| G3 | Create the Netlify project and deploy the branch | owner (account), Claude guides | none (hard cap) | none |
| G4 | Enter secrets in Netlify | owner only, never in chat | none | — |
| G5 | Create the staging admin | owner or Claude after approval | none | staging only |

Never: upgrade either plan, add a card, buy a domain, use production credentials, or connect real
member data.
