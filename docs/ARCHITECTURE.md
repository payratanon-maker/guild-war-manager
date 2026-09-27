# Architecture

## Current foundation

- **Application:** Next.js App Router with React and TypeScript strict mode.
- **Styling:** Tailwind CSS 4. Keep shared guild-class colors in `src/lib/guild-classes.ts`; do not repeat class color literals in UI components.
- **Database and identity:** Supabase PostgreSQL and Supabase Auth. Phase 2 adds username/password registration, SSR cookie sessions, account approval, role RPC, and RLS policies. The browser receives only the publishable key.
- **Files:** private Supabase Storage buckets hold result screenshots and public bucket holds Ultimate icons. Storage access is enforced by Supabase Storage RLS.
- **Tests:** Vitest for domain tests; PGlite runs the real SQL migration and PostgreSQL constraints/triggers locally without credentials.
- **Formatting:** Prettier; **linting:** ESLint with the Next.js recommended rules.
- **Deployment:** Vercel is planned for a later phase. No deployment configuration is required yet.

## Boundaries

- Keep shared domain configuration in `src/lib/` and import it instead of duplicating constants.
- Read public Supabase settings through `getSupabasePublicEnv()` in `src/lib/env.ts` when database integration is introduced.
- Keep service role credentials server-only. Browser code must never receive them.
- Keep route and presentation code under `src/app/`; add domain behavior only as its requirements become concrete.
- Keep row-level security enabled on every domain table. Phase 2 role policies read the current profile from PostgreSQL on each query, so a role change takes effect without waiting for a JWT refresh.
- Keep Storage policies in their later phases.

## Phase 2 identity and authorization

- A username maps deterministically to `<lowercase-username>@users.guild-war-manager.internal` for Supabase Auth email/password identity. ICANN [permanently reserved `.internal` for private use](https://www.icann.org/en/board-activities-and-meetings/materials/approved-resolutions-special-meeting-of-the-icann-board-29-07-2024-en); the namespace cannot be delegated to an unrelated public mailbox. The previous `.invalid` mapping produced `email_address_invalid` on hosted Supabase. The `.internal` format passed hosted registration and password login after **Confirm email** was disabled. No real email is collected, and email-based recovery is unavailable until a verified contact method is added.
- Migration `20260927000007_auth_internal_domain.sql` replaces only the Auth insert trigger function. It creates a PENDING/no-role profile when metadata and the new address match. Migration `20260927000008_auth_email_immutable.sql` prevents a later `auth.users.email` change from breaking the deterministic username login. The case-insensitive username index, role checks, and RLS remain in force. Passwords remain solely in Supabase Auth. Development signup failures log the Supabase code, status, and a redacted message on the server. The live disposable account passed a protected-read denial check and was deleted after verification. The email-change guard passed a local PostgreSQL test; its presence was verified on hosted Supabase, but a live email-change attempt was not performed.
- A database administrator must provision the first OWNER explicitly. The public registration path never grants a role. `decide_account` checks the caller's current database role. ADMIN can approve only MEMBER/OFFICER and cannot modify ADMIN/OWNER. OWNER manages roles but cannot demote/reject its own account.
- `private.current_role` and `private.has_role` are SECURITY DEFINER functions in a non-exposed schema with fixed search paths. Table RLS permits self-profile read and approved role-specific operations. Account profile updates are available only through the checked RPC; pending/rejected accounts have no guild-data policy.
- Next.js server actions use the user-scoped SSR client and its cookies, never a service-role key. The Next.js proxy refreshes sessions. Protected pages use verified Auth claims plus live profile lookup; database RLS remains authoritative for every data request.
- Local PGlite tests exercise migration/policies and role boundaries. Live Auth and RLS integration needs a configured Supabase project before production acceptance.

## Phase 4 membership and attendance

- Admin/Owner manage roster rows; archive and restore preserve the same player ID and all historical foreign keys. Database guards require removal from Current Formation and clearing `AVAILABLE` attendance for preparing Wars before archive.
- Attendance rows belong to a preparing War. Officer+ may update them. The formation insert/update guard rejects a player marked `LEAVE` for any preparing War, while finalization rechecks the War-specific snapshot. Column-level grants prevent clients from changing immutable identities or timestamps through ordinary update calls.

## Phase 5 formation editing

- All UI placement requests call `move_formation_player`, an authorized PostgreSQL function. It locks the singleton Current Formation row, checks the player and Leave status, and moves, swaps, or removes in one transaction. The deferrable unique slot constraint permits atomic swaps and still rejects duplicate/overfilled positions at commit.
- dnd-kit provides pointer/touch/keyboard drag targets. The same action powers a select-player/choose-squad fallback, and the UI refreshes only after a successful database write. The Player Pool is active-only and filters by search/class.
- The Builder's Normal and Compact modes share the same client component, drag/drop targets, and server actions. Compact mode rearranges A1–A5 above B1–B5, condenses player rows, and collapses the Pool until opened; it adds no database state or authorization path.

## Phase 6 Ultimate and War history

- Officer+ sets `ultimate_id` on a Current Formation assignment. Admin+ manages Ultimate choices and uploads PNG/WebP icons to the public `ultimate-icons` Supabase Storage bucket, with a 2 MiB limit and role-checked insert/delete policies. Uploaded paths are stored on the Ultimate row. Current assignments do not permanently attach an Ultimate to a player.
- Officer+ creates a preparing War, then finalizes it. The existing Phase 1 database trigger validates and atomically snapshots the Current Formation, including name, class, party/squad/slot, Ultimate metadata, and War attendance. Historical pages read only `war_assignments` snapshot fields and keep archived players visible.
- The icon bucket migration is conditional in PGlite because Supabase's `storage` schema is absent there. Hosted Storage policies and upload behavior require live verification.

## Phase 7 manual results and statistics

- Officer+ writes official raw result fields only for finalized War assignments. Database RLS controls writes, the finalized-assignment guard rejects drafts, and an audit trigger stamps the authenticated editor. Server actions check that a row was actually changed because an RLS-filtered UPDATE may affect zero rows without an error.
- `src/domain/statistics.ts` is the sole aggregation and KDA implementation. It selects War #1/latest/last five/all time, filters historical class snapshots and Party, keeps archived players in historical views, sums raw fields, and ranks ties deterministically by name then player ID. `src/lib/statistics-data.ts` pages through Supabase rows so the API row limit does not truncate history.
- Results, statistics, dashboard previews, history detail, and player profiles read the same snapshot/result data. Official statistics remain separate from OCR candidates. Marking Leave now unassigns the player atomically from Current Formation (DEC-015).

## Phase 8 dashboard and profiles

- src/domain/dashboard.ts derives roster/class, attendance, eligible assignment, Party, and squad summaries from batched query results. It excludes archived Players from active counts and Leave Players from current eligible assignment counts.
- Dashboard leaderboard previews and Player Profiles use the shared paged statistics loader. Profile history reads frozen assignment snapshots, so historical class and Party/squad remain stable after current roster edits. Admin/Owner approval counts are queried only for authorized roles.

## Phase 9 screenshot result review

- Browser uploads go directly to private war-result-screenshots Storage with the user's Supabase session and Officer-only Storage RLS. This avoids sending large screenshot bodies through a serverless action. The server action validates the War, storage path, MIME/signature, finalized participants, then downloads the stored original for the configured provider.
- ExtractionProvider is replaceable. The default ManualReviewExtractionProvider creates an empty candidate with a diagnostic reason while OCR credentials are pending; it never fabricates extracted values.
- war_extraction_candidates.candidate_payload remains separate from war_player_stats. Officers edit candidate mappings/values through review_extraction_candidate; only a second explicit confirm_extraction_candidate call writes official statistics and marks the candidate confirmed in one database transaction. The RPC validates unique participant IDs, finalized War ownership, and nonnegative safe integers. RLS and Storage policies are additive least-privilege policies; existing domain RLS is unchanged.
- Original upload, provider diagnostics, and corrected candidate records remain retained. Multiple screenshots are represented as separate uploads/candidates. The application does not merge them automatically.

## Phase 10 Discord attendance

- Admin/Owner maps a stable 17–20 digit Discord User ID to one active Guild Player in Settings. A database trigger rejects links to archived players; RLS exposes link management to Admin+ only.
- The Node.js HTTP interaction endpoint verifies Discord Ed25519 signatures against the exact raw request body and a five-minute timestamp window, handles PING, and gates actions by configured guild/channel. It uses Discord's defer response then edits the interaction response after a bounded server-side operation; Vercel function duration is explicitly capped at 20 seconds to fit the 8-second Supabase and 5-second Discord request timeouts.
- A service-role Supabase client exists only in the signed interaction route. It calls one RPC granted to service_role only; no other application request receives the service key. The RPC maps Discord ID, chooses the newest preparing War for slash commands or honors the War ID bound into an attendance message's buttons, allows only AVAILABLE/LEAVE, and uses the standard attendance trigger so Leave removes Current Formation placement. Old buttons fail when their War is no longer preparing. No Gateway connection or privileged Discord intents are used.
- Guild-scoped slash commands are registered with a local script. war-attendance requires Discord Manage Server permission; join/leave buttons and commands are channel-scoped. The Bot token is only needed for local command registration, not request handling.

## Phase 11 settings and product polish

- The application remains single-guild, so display name and guild-level War preferences are not stored as mutable configuration. Settings manages account visibility, Ultimates, icons, and optional Discord-to-player links. The visible language switch stores a TH/EN preference in an HTTP-only same-site cookie; account roles and approval statuses use the central dictionary.
- Query failures are kept distinct from empty results on Members, History, Statistics, Approvals, and Settings. This prevents a missing migration or RLS denial from looking like a valid empty guild.

## Phase 13 deployment

- Deploy the Next.js App Router app on Vercel's Node runtime. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required; the latter accepts Supabase publishable or legacy anon keys. Service-role and Discord tokens remain server-side. Preview must use a separate non-production Supabase backend.
- Apply timestamped SQL migrations only after verifying the target project's migration history. Production currently has migrations through `20260927000008`; Phase 9/10 integrations must not be enabled on Production until their migrations and acceptance have passed on a separate project. Auth Confirm Email remains disabled for the username-only/no-email product requirement; Auth recovery by email is unavailable.
- Detailed operator steps and external configuration gates are recorded in `docs/DEPLOYMENT.md`. No Vercel deployment or remote schema migration is performed from this workspace.

## Phase 1 data model

- `account_profiles` references `auth.users`. New profiles default to `PENDING` with no role; only `APPROVED` profiles may carry `MEMBER`, `OFFICER`, `ADMIN`, or `OWNER`. Passwords remain in Supabase Auth.
- `guild_players` stores current name/class and archive state. Hard deletion is blocked; archiving requires removing the player from Current Formation and clearing `AVAILABLE` attendance for preparing Wars first. Historical assignment and statistics foreign keys remain intact.
- One seeded `current_formation` row persists between Wars. `current_formation_assignments` and `war_assignments` are separate tables. Party `A`/`B`, squad `1`–`5`, and slot `1`–`6` form the ten six-player squads. Unique constraints block duplicate players and occupied slots. The current slot constraint may be deferred within a transaction for an atomic swap.
- `war_attendance` belongs to a War. Finalizing a War copies the Current Formation into immutable `war_assignments` with player name, class, Ultimate metadata, attendance, Party, squad, and slot snapshots. A `LEAVE` or archived player aborts the whole transition. War, formation, player, and attendance row locks serialize relevant writes; PostgreSQL unique indexes enforce occupancy under concurrent attempts.
- `war_player_stats` stores manual results for finalized participants. Nonnegative values are capped at JavaScript's safe integer limit; KDA remains derived rather than stored.
- `war_result_uploads` and `war_extraction_candidates` prepare for a reviewed OCR pipeline. They have no write path into official statistics. `discord_player_links` records explicit Discord User ID to Guild Player mappings.
- `src/domain/model.ts` is the application domain contract. Tests compare its enum values and the canonical class IDs with PostgreSQL enum labels. Generated Supabase client row types can be added when a project/client is configured.

The migration is tested against PGlite's PostgreSQL engine. A linked Supabase project and multi-connection concurrency test environment are not configured yet; deployment and live RLS policy validation remain future verification gates.

## Decisions

1. **Use a single Next.js application.** The known product fits one application context; avoid a monorepo until there is a concrete need.
2. **Use one canonical guild class list.** Class IDs, names, and colors have one source of truth.
3. **Keep Phase 0 credential-free.** Supabase environment names are documented, but no secrets, clients, or external service connections are required for the foundation.
4. **Use local Markdown for project issues until a remote tracker exists.** See `docs/agents/issue-tracker.md`.
5. **Snapshot on finalization.** The War status transition copies the current lineup in one database transaction and freezes the historical War.
6. **Fail closed before Auth UI.** All public domain tables have RLS enabled with no client policies until Phase 2 adds reviewed role-based access.
