# Project State

**Implementation status:** Phases 0–14 complete and locally verified.  
**Hosted Production acceptance:** Phases 2–7 deferred; no fabricated PASS.  
**Release state:** implementation complete; not yet approved for real guild data entry.

## Delivered

- Phases 0–7: Next.js/TypeScript foundation, Supabase domain/RLS/Auth, guild members/attendance, formation, immutable War history, manual results, and statistics.
- Phase 8: dashboard counts/class/squad previews, leaderboards, approvals summary, and historical player profiles.
- Phase 9: private screenshot Storage, provider interface/manual fallback, candidate review/correction, and explicit atomic Officer confirmation for official results.
- Phase 10: signed Discord HTTP interactions, stable Discord ID links, War-bound buttons, slash commands, and a service-role-only attendance RPC.
- Phase 11: TH/EN audit improvements, localized role/status labels, loading/error vs empty-state handling, and confirmation prompts for finalization/archive/restore/OCR review decisions.
- Phase 12: role/RLS/constraint/snapshot/OCR/Discord/statistics tests and security grant review. No security policy was weakened.
- Phase 13: Vercel/Supabase deployment runbook and environment/migration gates. Deployment remains external.
- Phase 14: integrated PGlite acceptance, browser language/protected-route checks, and mobile/tablet registration layout checks.
- Post-phase Builder improvement (2026-09-28): Normal/Compact toggle, a two-row desktop board for A1–A5 and B1–B5, short squad/player rows, and a collapsible Player Pool for editing. Formation actions and database constraints are unchanged.

## Final verification

- `npm run format:check` — PASS
- `npm run lint` — PASS
- `npm run typecheck` — PASS
- `npm test` — PASS, 15 files / 47 tests
- `npm run build` — PASS
- `node --check scripts/register-discord-commands.mjs` — PASS
- Local browser: registration labels verified in Thai and English; no horizontal overflow at 390×844 and 768×1024; unauthenticated `/builder` redirects to `/login`. No account credentials, screenshots, or War data were submitted.
- Compact Builder visual check: a temporary local fixture with 60 assigned players fit all ten squads at 1366×768 and 1280×800 (last card bottom y=670). At 1024×768 and 390×844 the grid wrapped without horizontal overflow. The fixture was removed before the final build; no hosted data was changed.

## Independent engineering audit — 2026-09-27

- Rechecked Auth/RBAC/RLS, member and attendance paths, formation and snapshots, results/statistics, dashboard/profile, OCR boundaries, Discord, localization, environment handling, migrations, deployment gates, and local browser routes.
- Fixed dashboard and Members attendance totals so archived players with retained `LEAVE` history do not count as current members. Added a regression case; all 15 test files / 47 tests pass.
- The audit was local and read-only against hosted Production. No migrations, account changes, War data, or Storage writes were made.
- `npm audit --omit=dev` remains unverified because the npm registry could not be reached.

## Hosted Production acceptance

**DEFERRED.** Hosted Phase 2–7 destructive/multi-role acceptance remains deferred because there is no staging branch/target. Production was not used for synthetic War/role/stat tests. Previously observed Production has migrations through `20260927000008`; `00009` and `00010` are not applied there.

## External configuration and known limits

- Create/authorize a separate non-production Supabase project and run hosted role, Storage, OCR and Discord acceptance there before enabling migrations 00009–00010 in Production.
- OCR provider activation is pending; current provider is intentionally manual-only.
- Discord Developer Portal app, endpoint, bot token for local command registration, IDs/channel, server-only service key, and live test guild are pending.
- Vercel project authorization/link and deploy are pending. This workspace has no `.git`/`.vercel` project link or installed Supabase/Vercel CLI.
- `npm audit --omit=dev` could not reach `registry.npmjs.org`; dependency advisory status is unverified.
- No known remaining software defects from the completed review. No Phase 15 was started.

## Retained hosted test artifacts

- PENDING Auth account: `GwmProbed670bbbcdd`; password not retained.
- Archived Guild Player: `GWM Acceptance Edited 20260927`.
- To remove the disposable Auth account, first verify its exact identity/status and that it is still PENDING with no role. Because the profile FK uses `ON DELETE RESTRICT`, a project administrator must remove that verified PENDING `account_profiles` row through the privileged SQL editor (confirm exactly one row) before deleting the matching Auth user in Supabase Auth. Do not run this cleanup automatically. Keep the archived Player to preserve the historical identity; hard-delete is blocked by design.

## Next operator actions

Follow `docs/DEPLOYMENT.md`: create non-production Supabase; verify migration history; apply/review migrations; perform hosted acceptance; configure Vercel with separate Preview/Production Supabase settings; run safe smoke tests; only then approve real guild data entry. Do not create fake finalized Wars in Production.
