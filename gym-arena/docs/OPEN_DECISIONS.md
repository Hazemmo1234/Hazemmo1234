# GYM ARENA — Open Decisions & Defaults Taken

The owner asked Claude to finalize the remaining details. These are the defaults chosen. Each can be changed later; Claude Code must implement the default, not invent alternatives.

## Changed from the original brief (owner should know)
| Brief said | Implemented as | Why |
|---|---|---|
| 9 categories, 900 pts, equal weight | 7 categories, 1000 pts, weighted | Discovery decisions Q13, Q16, Q17 |
| Coaches submit, Admin approves | Auto-approve; Admin can void/edit until close | Full trust (Q50) |
| Video/photo evidence per challenge | Photo only when points increase | Q39, Q61 |
| Mutable points ledger | Append-only entries + derived scores + frozen results at close | Same auditability, simpler and impossible to drift |
| Coach color on leaderboard | Not shown on TV in MVP | Coach ranking removed (Q46); avoids implying coach competition |
| Notifications | Not in MVP | No member accounts; coaches see everything in-app |
| Navy + electric blue + gold palette | DFN GYM brand: logo red `#C42A1E` + near-black + white; gold/silver/bronze kept for podium only | Owner asked to use the gym's logo colors |

## Defaults chosen by Claude (no owner input yet)
| # | Topic | Default |
|---|---|---|
| D1 | UI language | Arabic RTL, Western digits, English category names |
| D2 | Coach login | Email + password created by Admin |
| D3 | TV access | Secret key in URL, regenerable |
| D4 | TV refresh | Polling every 10 s |
| D5 | Missing baseline in one category (non-rookie) | That category = 0 this season |
| D6 | Attendance above plan | Capped at 100% (max 200 pts) |
| D7 | Coach can backdate | No; Admin can within the active season |
| D8 | Season close | Manual by Admin after `ends_on`; logging auto-locks at midnight |
| D9 | Rank arrows | Change since start of today (Cairo) |
| D10 | Ties in Top 3 | Shared rank; all tied shown as winners |
| D11 | Rule/formula changes | Code constants; changed only between seasons |
| D12 | Phone | Required, unique, Egyptian mobile |
| D13 | Images | Compressed client-side to ≤1280 px WebP |
| D14 | Scoring engine | TypeScript pure module (server-side), not SQL |

## Still open (decide before launch, none block M0–M5)
- Exact prize announcement text and who hands prizes (outside system).
- SVG / transparent PNG of the DFN GYM wordmark (current brand assets derived from a JPEG — usable, but a vector is sharper on the TV).
- Domain name.
