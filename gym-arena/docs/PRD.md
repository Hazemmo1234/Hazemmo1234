# GYM ARENA — Product Requirements (MVP)

Read with: PRODUCT_VISION, BUSINESS_RULES, SCORING_SPECIFICATION, USER_ROLES_AND_PERMISSIONS, UX_SCREEN_SPECIFICATION.

## Goals
1. Run a complete monthly championship with zero spreadsheets.
2. Coach logs a result in ≤ 15 s on a phone.
3. TV shows a live, premium leaderboard updated within ~10 s of any entry.
4. Admin closes the month and reveals winners on the TV in one click each.

## Non-goals (MVP)
Member accounts, verification/approvals, anti-cheating, coach rankings, notifications, offline mode, multi-branch, check-in integration, prize/payment handling, analytics beyond the dashboard.

## Functional requirements
| ID | Requirement | Rules |
|---|---|---|
| FR-1 | Staff sign-in; role-based areas | BR-X1 |
| FR-2 | Admin manages coaches | BR-P7 |
| FR-3 | Coaches/admin register participating members with auto Member ID | BR-P1–P3 |
| FR-4 | Admin reassigns / deactivates members with history kept | BR-P5, BR-P6 |
| FR-5 | Admin creates seasons (preseason + monthly) | BR-S1, S2, S9 |
| FR-6 | Coach logs results per category with live preview | BR-E1–E6, SCORING |
| FR-7 | Photo required only when entry increases points | BR-E6 |
| FR-8 | Auto attendance + manual "Attended" | BR-E7 |
| FR-9 | Same-day undo for coaches; admin edit/void until close | BR-E8–E10 |
| FR-10 | Live scoring and ranking incl. tie-breaks and rookies | SCORING §3–5 |
| FR-11 | Coach & admin leaderboard views | UX C6 |
| FR-12 | TV display: live, preseason, between, reveal modes | UX section C |
| FR-13 | Close season → frozen results → reveal | BR-S5–S8 |
| FR-14 | Season history | BR-W2 |
| FR-15 | Audit log of admin/coach corrections | BR-E11 |
| FR-16 | Daily rank snapshot for movement arrows | ARCH |
| FR-17 | Admin dashboard KPIs | UX A1 |
| FR-18 | PWA install for coaches (manifest + icons) | — |
| FR-19 | Full Arabic + English support: language switcher, RTL/LTR, per-staff language preference, independent TV language | BR-L1–L6 |

## Non-functional
- Performance: leaderboard API p95 < 500 ms at 150 members; TV payload < 100 KB excluding images.
- Availability: TV must survive network blips without going blank.
- Accessibility: coach UI tap targets ≥ 44 px; WCAG AA contrast on all text.
- Privacy: no phone numbers or evidence on TV; private buckets.
- Correctness: scoring module 100% branch coverage.
- Localization: no user-facing string hard-coded in components; Arabic and English message catalogs have identical keys; language choice never affects scoring, permissions or stored data.
- Write integrity: entries and attendance are written only through authenticated server APIs (BR-X4).

## Edge cases (all must have explicit behavior — see BUSINESS_RULES)
Coach change mid-month · coach leaves · member inactive · member absent part of month (simply fewer attendance days) · entry logged by mistake (same-day undo / admin void) · season extended · season ended but not closed (logging locked, TV "results coming soon") · ties · rule change mid-season (not supported in MVP — formulas are code constants; change only between seasons) · first-ever season (preseason; closed by the Admin, freezes baselines, no results — BR-S10) · member with no baseline in a category.
