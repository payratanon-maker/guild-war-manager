# Deployment Guide

## Current release gate

The repository is build-ready, but no Vercel deployment has been created from this workspace. The configured hosted Supabase project is Production and has migrations only through `20260927000008`; do not deploy Phase 9/10 features to that database until migrations `00009` and `00010` have passed a separate non-production Supabase project. The current plan has no staging branch, so create a separate Supabase project for Preview/local acceptance before using this feature set with guild data.

## Runtime and environment

Vercel should use the Next.js framework defaults, Node.js runtime (the Discord endpoint explicitly uses Node.js), `npm run build` for the production build, and the lockfile-based install command. The Discord route has an explicit 20-second maximum function duration to cover its bounded downstream timeouts. `.env.example` contains the full variable-name list and no values.

Required for the application:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the Supabase publishable key is accepted here; a legacy anon key is also compatible)

Optional integrations:

- Discord: `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_ATTENDANCE_CHANNEL_ID`, and `DISCORD_GUILD_ID` in server-side Production/Preview environments. Never add the service key or Bot token to any `NEXT_PUBLIC_` variable. `DISCORD_BOT_TOKEN` is only for the local command-registration script and should not be configured in the web runtime unless a later feature requires it.
- OCR: no provider is configured. The manual review provider is the safe default. Add only the selected provider's server-side credential after that provider is approved and implemented.

Store secret values as sensitive/write-only project environment variables where supported. Set separate Supabase credentials per Vercel environment; Vercel environment changes apply to new deployments, so redeploy after changing them.

## Supabase release procedure

1. Create a separate non-production Supabase project. Configure Authentication for username-only signup: email/password enabled, Confirm Email disabled, anonymous sign-in disabled. This application does not collect a recovery email; email-based recovery is unavailable.
2. Add local and exact production Site URL/redirect allow-list entries in Supabase Auth URL Configuration. Add Preview URL patterns only if Preview is connected to a separate non-production backend.
3. Verify target project ref and migration history before applying anything. Use `supabase migration list` after linking the intended target; resolve any mismatch against the actual schema before pushing. Never use `migration repair` as a guess.
4. Apply migrations in timestamp order to the non-production project, then run the acceptance checklist below. Inspect RLS policies, Storage bucket privacy/limits, and SQL function grants in Supabase.
5. Use `supabase db push` only after reviewing the exact target, pending migrations, and backup/restore plan. Apply to Production only after the staging-equivalent acceptance succeeds. The initial OWNER must be provisioned using the controlled database procedure in README; public signup never grants a role.

Useful Supabase CLI commands, run only from an authorized operator terminal:

```text
supabase link --project-ref <non-production-project-ref>
supabase migration list
supabase db push
```

For Production, repeat link and status verification with its exact ref. The previously observed Production project is `tjqwfpaenuweuhtwyjgz`; do not use it for disposable War acceptance.

## Vercel release procedure

1. Connect the repository to the intended Vercel project and select the production branch. Configure required Supabase public values separately for Development, Preview, and Production. Preview must point to the non-production Supabase project.
2. Add Discord server-only variables only after setting the Discord endpoint and validating the bot in a private test guild/channel. Keep the Bot token out of the deployed web runtime when possible.
3. Run format, lint, typecheck, tests, and `npm run build` before creating a Preview deployment. Verify the Preview against the non-production backend.
4. Promote/deploy to Production only after database migrations, auth redirect configuration, and safe smoke tests are complete. Confirm the deployment's runtime logs and the sign-in, registration/pending, dashboard, and protected-page behavior.
5. Never copy `.env.local`, Supabase service-role keys, Discord tokens, screenshots, or test fixtures into source control.

## Acceptance checklist before real guild use

- Migrations are in sync and the intended database contains all reviewed migrations.
- Supabase RLS is enabled and the role-based tests pass against that target.
- Private `war-result-screenshots` and public `ultimate-icons` buckets have expected MIME and size limits/policies.
- Supabase Auth has email/password sign-in, Confirm Email disabled, anonymous sign-in disabled, and exact Site URL/redirect configuration.
- First OWNER is explicitly bootstrapped; an approved MEMBER, OFFICER, ADMIN and OWNER were tested in a non-production target.
- Manual War results and statistics, formation snapshots, archive/restore, OCR review/confirm, and Discord test-guild attendance are accepted.
- Vercel Production environment contains only values intended for the Production Supabase project; Preview uses non-production credentials.
- Production build and non-destructive smoke checks pass. Full destructive acceptance must remain separate from Production.

## External actions still needed

This workspace has no Vercel CLI/project link, no Supabase CLI/link configuration, and no separate Supabase staging project. A project owner must create/authorize those external resources. No deploy or remote migration was attempted. See the official [Supabase migration guide](https://supabase.com/docs/guides/deployment/database-migrations), [Supabase Auth URL configuration](https://supabase.com/docs/guides/auth/redirect-urls), and [Vercel environment-variable guide](https://vercel.com/docs/environment-variables).
