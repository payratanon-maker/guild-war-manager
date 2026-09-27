# Discord Attendance Setup

This integration uses an official Discord Application and HTTP interactions. It does not connect to the Gateway, read channel history, use message-content/member intents, or automate a user account.

## Application setup

1. Create a Discord Application in the Developer Portal and add a Bot user. Do not enable privileged Gateway intents.
2. Invite the app to the one guild using the bot and applications.commands scopes. Grant only View Channel and Send Messages in the configured attendance channel. Do not grant Administrator, Manage Messages, or Read Message History.
3. Set the application's Interactions Endpoint URL to https://YOUR_HOST/api/discord/interactions.
4. In the application environment, set DISCORD_APPLICATION_ID, DISCORD_PUBLIC_KEY, DISCORD_GUILD_ID, DISCORD_ATTENDANCE_CHANNEL_ID, SUPABASE_SERVICE_ROLE_KEY, and NEXT_PUBLIC_SUPABASE_URL. Keep the service-role key and all Discord configuration server-side. Never use a NEXT_PUBLIC_ prefix for secrets.
5. Register the guild commands locally from a trusted terminal after adding DISCORD_BOT_TOKEN to its environment. With .env.local configured, run: node --env-file=.env.local scripts/register-discord-commands.mjs

   The war-attendance command is restricted to users with Manage Server permission so regular members cannot publish attendance prompts. All commands are guild-install/guild-context only; registration upserts these commands individually instead of bulk-overwriting other application commands. /war-join and /war-leave remain available in that guild.

6. In Discord, use /war-attendance in the configured attendance channel. It creates a message with Join War and Leave War buttons. Members may also use /war-join and /war-leave.
7. In Guild War Manager → Settings, an Admin/Owner maps each active Guild Player to the user's stable Discord User ID. Enable Developer Mode in Discord and copy the User ID; display names are never used for matching.

## Request and database safety

- The endpoint validates Discord's Ed25519 signature over the timestamp and raw body, rejects timestamps outside five minutes, acknowledges PING, and limits actions to the configured channel and optional guild.
- Attendance actions are deferred immediately to meet Discord's interaction acknowledgement deadline. A server-side follow-up reports success/failure. Join/Leave buttons carry the War ID of the posted prompt, so an old prompt cannot silently change attendance for a later War.
- The route's service-role client can call only the narrow discord_set_attendance RPC in its own code path. Database execute privilege is granted to service_role only. The RPC accepts a Discord ID and AVAILABLE/LEAVE, resolves the active Player mapping and latest preparing War, and uses the existing attendance trigger so Leave atomically unassigns the Player.
- Repeated interactions are idempotent. Unknown mappings, archived Players, malformed IDs, and missing preparing Wars fail closed. The application has no user-to-Discord lookup by display name.
- No Discord token, public key, or interaction token is written to logs. The Bot token is needed only by the local command registration script.

## Local verification and pending activation

Automated signature, command/button mapping, role-gated mapping, and attendance RPC tests run without Discord credentials. Live activation requires a public HTTPS deployment URL, Developer Portal application, bot token for command registration, configured IDs, a Supabase deployment of migrations through 20260927000010, and the service-role key. No live Discord server action has been performed in this project phase.
