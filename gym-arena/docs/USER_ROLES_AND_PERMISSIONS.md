# GYM ARENA — Roles & Permissions

## Roles
| Role | Auth | Description |
|---|---|---|
| `admin` | Supabase Auth (email + password) | Gym owner. Full control. Usually 1 account. |
| `coach` | Supabase Auth (email + password, created by Admin) | Logs results for own clients. |
| TV | No user account. Access via `/tv?key=<tv_key>` | Read-only public display. Key stored in `app_settings`, regenerable by Admin. |

No member accounts in v1. No Head Coach role.

## Matrix
| Action | Admin | Coach | TV |
|---|---|---|---|
| Create / edit / extend season | ✅ | ❌ | ❌ |
| Close season (freeze results) | ✅ | ❌ | ❌ |
| Trigger winner reveal | ✅ | ❌ | ❌ |
| Create / deactivate coach accounts | ✅ | ❌ | ❌ |
| Register participating member | ✅ (any coach) | ✅ (assigned to self) | ❌ |
| Reassign member to another coach | ✅ | ❌ | ❌ |
| Activate / deactivate member | ✅ | ❌ | ❌ |
| Edit member name, phone, photo, consent | ✅ all | ✅ own | ❌ |
| Edit planned sessions (current season) | ✅ all | ✅ own | ❌ |
| View member phone number | ✅ all | ✅ own | ❌ |
| Create entry / attendance | ✅ any member, any date in active season | ✅ own members, today only | ❌ |
| Void entry | ✅ any, until close | ✅ own, same day only | ❌ |
| Edit entry values | ✅ until close | ❌ (void + re-log same day) | ❌ |
| View evidence photos | ✅ all | ✅ own members | ❌ |
| View full leaderboard (names + points) | ✅ | ✅ | ✅ public fields |
| View other coaches' members' details | ✅ | ❌ | ❌ |
| View season history | ✅ | ✅ | ❌ |
| View audit log | ✅ | ❌ | ❌ |
| Regenerate TV key | ✅ | ❌ | ❌ |

## Enforcement
- **Database (RLS) is the source of truth**; UI hiding is cosmetic.
- "Own member" = `members.coach_id = auth.uid()`.
- Time-based rules (same-day void, active season, today-only logging) are enforced in server code **and** in database functions/constraints where practical.
- TV endpoint uses a server route that validates the key and returns a curated payload; the browser never queries tables directly for TV.
