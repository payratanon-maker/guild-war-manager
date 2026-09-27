# Release Handoff — Guild War Manager

**Implementation:** Phases 0–14 complete.  
**Hosted Production acceptance:** Phases 2–7 intentionally deferred.  
**Release:** local engineering acceptance passes; do not start Phase 15 or call hosted acceptance PASS.

## Delivered systems

- Dashboard and historical Player Profile: `src/app/page.tsx`, `src/app/members/[playerId]/page.tsx`, `src/domain/dashboard.ts`.
- Manual War results/statistics: `src/app/results/`, `src/domain/statistics.ts`, `src/lib/statistics-data.ts`.
- Screenshot pipeline: `src/app/results/extraction*`, `src/app/results/screenshot-uploader.tsx`, `src/app/results/review-editor.tsx`, `src/domain/extraction*`. Default provider is manual-only. Human confirmation calls `confirm_extraction_candidate`; candidates never write official stats before that RPC.
- Discord attendance: `src/app/api/discord/interactions/route.ts`, `src/lib/discord-interaction.ts`, `src/lib/discord-signature.ts`, `src/app/settings/`, `scripts/register-discord-commands.mjs`. No self-bot or privileged Gateway intents.
- Localization and confirmation prompts: `src/lib/i18n.ts`, `src/components/confirm-form.tsx`.
- War Builder presentation: `src/app/builder/formation-board.tsx` and `src/app/globals.css` now offer Normal and Compact modes. Compact shows A1–A5 above B1–B5, opens the Player Pool on demand, and uses the existing move/Ultimate actions.
- Deployment: `docs/DEPLOYMENT.md`, `docs/DISCORD_SETUP.md`, `.env.example`.

## Database migrations

Timestamped SQL migrations live under `supabase/migrations/`:

- `20260927000000`–`00008`: domain, roles/RLS, attendance, formation, Storage icons, results audit, username internal identity, immutable Auth email.
- `20260927000009_result_extraction.sql`: private screenshots, OCR candidate/review/atomic confirmation.
- `20260927000010_discord_attendance.sql`: Discord mapping, archive guard, service-role-only attendance RPC.

Hosted Production was last observed at `00008`. Do not use OCR or Discord integration with that project until a separate Supabase project passes acceptance and the Production migration rollout is explicitly planned.

## Verification record

- Formatter check — PASS.
- ESLint — PASS.
- Strict TypeScript — PASS.
- Vitest/PGlite — PASS, 15 files / 47 tests. Includes PENDING isolation, role boundaries, formation limits/Leave/archive, immutable snapshot, manual stats/KDA/periods/leaderboards, OCR confirmation boundary, Discord RPC ACL/idempotence/stale War, localized dictionary parity, and archived-player attendance totals.
- Production build — PASS (Next.js 16.3.6).
- Discord registration script syntax — PASS.
- Browser — Thai/English register form, 390×844 and 768×1024 document widths, and unauthenticated protected-route redirect verified. No hosted writes performed.
- Compact Builder visual check — all ten full squads fit at 1366×768 and 1280×800; responsive layouts at 1024×768 and 390×844 had no horizontal overflow. Pool reveal, player selection, and return to Normal mode were exercised using a temporary local fixture, which was removed before the production build.
- Code review — authorization remains server/database enforced; service key is only used in the signed Discord route; all reviewed security-definer SQL functions use fixed search paths and role checks; confirmation/finalization actions are explicit; database query failures are no longer presented as empty results in core pages.
- Independent audit follow-up — corrected Dashboard and Members current attendance totals to exclude archived players whose retained preparing-War attendance is `LEAVE`; the regression suite passes. The check was local and made no hosted Production writes.

## External setup required

- Non-production Supabase project and hosted acceptance (including Auth, all roles, RLS, Storage, migrations, historical invariants).
- Production rollout approval for migrations 00009–00010 only after staging acceptance.
- Discord Application and bot credentials/configuration; live guild/channel verification.
- OCR provider credentials/configuration if OCR automation is desired; manual review works without a provider.
- Vercel project connection/authorization, environment variables, Preview/Production deployments, and safe smoke tests.

`.env.example` has variable names only. Required app settings: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Discord adds `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_ATTENDANCE_CHANNEL_ID`, and `DISCORD_GUILD_ID`. The Bot token is local command-registration-only; keep all service/Discord secrets server-side. Keep Confirm Email disabled for the username-only signup requirement; email recovery is unavailable.

## Deferred items and warnings

- Hosted Phase 2–7 acceptance is **DEFERRED**, not passed. Do not create/finalize fake Production Wars or assign test roles.
- Hosted Supabase Storage policies for new migrations and live Discord/OCR integration are not verified.
- `npm audit --omit=dev` could not reach `registry.npmjs.org`; dependency advisory status is unverified.
- This workspace has no `.git` or `.vercel` project link and no Supabase/Vercel CLI; no remote deploy or migration was attempted.
- No known software bug remains from this run.

## Retained Production artifacts and safe cleanup

- PENDING Auth account `GwmProbed670bbbcdd` (no password retained). Cleanup only after an operator verifies the exact account is still PENDING with no role. The Auth profile uses `ON DELETE RESTRICT`: remove the matching PENDING profile row with privileged SQL, verify exactly one row, then delete the matching Auth user in the Supabase dashboard. No automated cleanup was performed.
- Archived Guild Player `GWM Acceptance Edited 20260927`. Keep the record for history; hard deletion is blocked by design. It can be restored through normal Admin UI if an owner confirms it should return to the roster.

## Deployment and hosted acceptance sequence

1. Follow the non-production Supabase setup and migration-history checks in `docs/DEPLOYMENT.md`.
2. Apply/review migrations 00000–00010 on the separate project, verify RLS/constraints/Storage/function grants, and run hosted acceptance across MEMBER/OFFICER/ADMIN/OWNER.
3. Configure Vercel Preview with that non-production Supabase project; exercise safe UI, OCR manual review, and a private Discord test guild.
4. Back up and check Production migration history before scheduling migrations 00009–00010. Never guess/repair migration history.
5. Configure Production environment with Production Supabase settings; deploy only after staging acceptance. Smoke test login, PENDING denial, dashboard, and protected routes without synthetic War history.
6. Complete the deferred Phase 2–7 hosted tests on staging. Only then consider the app ready for real guild data entry.

Do not mark hosted acceptance PASS until those remote steps actually pass. Do not start Phase 15 automatically.
