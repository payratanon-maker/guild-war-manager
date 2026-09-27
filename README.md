# Guild War Manager

Next.js application for guild roster, attendance, formation, War history, results, statistics, screenshot review, and optional Discord attendance.

## Local setup

1. Install Node.js 22.12+ or 24+ and run `npm install`.
2. Create a Supabase project. Copy `.env.example` to `.env.local` and set its project URL and publishable (or legacy anon) key. Never put a service-role key in a `NEXT_PUBLIC_` variable.
3. Review and apply the SQL files in `supabase/migrations/` in timestamp order to a non-production project first. Check migration history before any remote push. Production currently has migrations through `20260927000008`; migrations 00009–00010 require staging acceptance before Production rollout.
4. In Supabase Auth, enable email/password signup and disable Confirm Email under Authentication → Sign In / Providers → User Signups. Users provide only username and password: the server maps each username to `@users.guild-war-manager.internal`. ICANN permanently reserves `.internal` for private use; no public mailbox receives these addresses. Email-based password recovery is unavailable.
5. Run `npm run dev`, register the first account, then provision that account as OWNER in the SQL editor with administrator access:

   ```sql
   update public.account_profiles
   set status = 'APPROVED', role = 'OWNER', decided_at = now()
   where lower(username) = lower('YOUR_USERNAME') and status = 'PENDING';
   ```

   Check exactly one row was updated. Never make first-owner approval available through public signup.

6. Sign in at `/login`. Members read guild data; Officers edit Attendance, Formation, and War results; Admins manage players and approve Member/Officer accounts; Owners can manage privileged roles.

## Integrations

The `ultimate-icons` bucket is created by the Phase 6 migration. Admins can upload PNG/WebP icons up to 2 MiB from Settings. Screenshot extraction defaults to manual review and never writes official results until an Officer explicitly confirms. See [Discord Attendance Setup](docs/DISCORD_SETUP.md) for optional bot configuration and [Deployment Guide](docs/DEPLOYMENT.md) for Vercel/Supabase release steps.

## Verification

```text
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Vitest applies reviewed migrations to in-memory PGlite and checks domain invariants, RLS boundaries, role privileges, snapshots, formation moves, result/extraction gates, Discord attendance, statistics, and localization. Hosted username-only signup/login and a safe protected-read denial were previously verified. Hosted full Phase 2–7 acceptance remains intentionally deferred until a non-production Supabase target is available.

## War Builder display

On `/builder`, use **Normal** for the full Player Pool and party columns. Use **Compact board** to place A1–A5 above B1–B5 for a desktop screenshot. **Show pool** reveals reserve players when editing in compact mode. Player rows still support drag/drop, Ultimate selection, and removal; formation rules remain enforced by the database.

## Structure

- `src/app/` — routes, server actions, and UI
- `src/components/` — shared visual components
- `src/domain/` — domain contracts, statistics, and database integration tests
- `src/lib/` — Auth, Supabase clients, localization, class configuration, data loading
- `supabase/migrations/` — ordered PostgreSQL and Storage migrations
- `docs/` — product specification, architecture, decisions, setup and current handoff
- `reference/` — future UI reference screenshots
