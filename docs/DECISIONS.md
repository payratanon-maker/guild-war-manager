# Durable Decisions

These decisions are product constraints. Change them only when a requirement is explicitly approved for revision.

## DEC-001 — Archive players instead of deleting history

Removing a Guild Player from current use archives them. Historical War/stat records remain, and archived players may be restored.

## DEC-002 — Attendance belongs to a War

Attendance is preparation/War-specific, not a permanent player attribute. `LEAVE` blocks assignment to that War.

## DEC-003 — Current Formation persists

Maintain and edit a persistent Current Formation between Wars; change only affected lineup members.

## DEC-004 — Historical Wars are immutable snapshots

A historical War preserves the formation and relevant results as they were for that War. Later current-state edits cannot alter it.

## DEC-005 — Snapshot class and Ultimate

Store the class and Ultimate used on each historical War assignment.

## DEC-006 — Enforce formation limits and uniqueness

A squad has at most six players, and a player cannot be assigned more than once in one formation/War. Enforce this beyond UI validation.

## DEC-007 — Canonical KDA

Calculate KDA as `(Kills + Assists) / max(Deaths, 1)` unless an authoritative game KDA is intentionally stored later.

## DEC-008 — OCR requires human confirmation

OCR/AI only proposes candidate War results. A user reviews/corrects/confirms before official statistics are saved.

## DEC-009 — Website/database is attendance source of truth

Discord attendance interactions are inputs; the website/database remains authoritative. Never use a Discord self-bot.

## DEC-010 — Centralized Thai/English translations

Provide a visible `TH | EN` switch and centralize translation keys rather than scattering localized strings through components.

## DEC-011 — Snapshot during War finalization

The database creates historical assignments from Current Formation in the transaction that finalizes a War. The snapshot is independent of later player, Ultimate, attendance, and formation edits.

## DEC-012 — Clear current participation before archiving

An archived player cannot remain in Current Formation or be `AVAILABLE` for a preparing War. An archive write fails until current assignments and future availability are cleared, avoiding silent lineup and attendance changes.

## DEC-013 — Username-only Supabase Auth

The initial implementation mapped username to a reserved `.invalid` internal email address for Supabase email/password identity. Hosted verification on 2026-09-27 returned `email_address_invalid`, so DEC-016 replaces that address format. The username-only form, PENDING profile trigger, no-role registration, and Supabase-managed password remain.

## DEC-014 — Explicit first OWNER and live role checks

An administrator provisions the first OWNER through a controlled database operation. Registration cannot self-approve. Role checks read the current profile from PostgreSQL and enforce permissions in RLS and a checked account-decision RPC.

## DEC-015 — Leave immediately clears Current Formation placement

Marking a player `LEAVE` for a preparing War removes their Current Formation placement in the same database transaction. The placement guard blocks re-adding them while any preparing War still records Leave. This keeps the lineup valid after an Attendance edit and avoids a later finalization surprise.

## DEC-016 — Private-use internal Auth identifiers

Public users continue to enter username and password without a personal email. Map usernames to `@users.guild-war-manager.internal`: ICANN permanently reserves `.internal` for private use, so public DNS cannot delegate it to an unrelated mailbox. Hosted Supabase accepted signup/login with this format after Confirm email was disabled. Tracked migrations update the trigger's exact address check and prevent later changes to the internal Auth email, which would break deterministic login. Do not use an unowned third-party domain or synthetic phone number. Keep public signup PENDING with no role and preserve the current database authorization rules. Email-based recovery remains unavailable.

## DEC-017 — Screenshot candidates require separate review and confirmation

Store original screenshots in a private Officer-only Supabase Storage bucket. Extraction providers write candidate payloads only. An Officer first saves a review and then explicitly confirms it; one checked database transaction writes all official rows and marks the candidate confirmed. Do not auto-merge screenshots or auto-publish provider output. The default provider is manual-only until an external provider is configured.

## DEC-018 — Upload screenshots directly to private Storage

The authenticated browser uploads screenshot bytes directly to Supabase Storage under Storage RLS. A server action validates the stored object and invokes the provider. This avoids routing large file bodies through serverless request limits while keeping the bucket private.

## DEC-019 — Discord attendance uses signed, channel-bound interactions

Use Discord HTTP interactions only. Verify Ed25519 signature over the raw body and timestamp before parsing. Bind interactions to the configured guild/channel and stable Discord User ID mapping. Defer attendance actions then edit the original interaction response. A single service_role-only RPC is the trusted mutation boundary; it resolves the latest preparing War for slash commands and accepts only the preparing War ID bound into a button message. Leave delegates unassignment to the established database trigger. Do not enable privileged intents, use a self-bot, or accept display names as identity.
