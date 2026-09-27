# Project Specification

## Product

**Guild War Manager** is a persistent production web application for managing MMORPG guild membership, weekly guild war formation, attendance, historical wars, and performance statistics. English and Thai are supported.

## Technology

- Next.js and React with TypeScript strict mode
- Tailwind CSS; use shadcn/ui where useful
- dnd-kit for formation drag and drop, with a mobile/touch select-target fallback
- Supabase PostgreSQL, Supabase Auth, and Supabase Storage
- Vercel deployment
- Discord integration in a later phase

## Localization

- Provide a visible `TH | EN` language switch.
- Use centralized translation keys; do not scatter user-facing translated strings across components.

## Player classes

Use the one canonical configuration at `src/lib/guild-classes.ts` throughout the app.

| Class        | Color      |
| ------------ | ---------- |
| Ironclad     | Yellow     |
| Sylph        | Pink       |
| Bloodstrom   | Red        |
| Celestune    | Blue       |
| Nightwaker   | Light Blue |
| Numina       | Purple     |
| Dragonsvelte | Green      |

## Guild players and accounts

Guild Players and website accounts are separate concepts. Authorized users manually add and edit players. Archive a player who leaves the guild instead of destroying their historical identity. Archived players:

- Are hidden from the active roster by default, do not count as active, cannot join future wars, and are absent from the current Player Pool.
- Remain visible in previous Wars and retain assignments, statistics, and historical leaderboard results.
- May later be restored.

Registration fields are Username, Password, and Confirm Password. New website accounts have `PENDING` status and cannot access protected guild data until approved. Users cannot grant themselves roles. Authorization must be enforced server-side/database-side, never only by hiding UI.

| Role      | Permissions                                                             |
| --------- | ----------------------------------------------------------------------- |
| `MEMBER`  | View Dashboard, formation, statistics, history, and profiles            |
| `OFFICER` | Member permissions plus attendance, War Builder, and War Result editing |
| `ADMIN`   | Officer permissions plus player management and account approval         |
| `OWNER`   | All permissions, including privileged role management                   |

## Attendance

Attendance belongs to a War/preparation, not permanently to a player. Statuses are `UNKNOWN`, `AVAILABLE`, and `LEAVE`. A player marked `LEAVE` cannot be assigned to that War.

## War and formation

Each War has Party A and Party B. Each party has five squads (`A1`–`A5`, `B1`–`B5`); each squad holds at most six players. Party capacity is 30, War capacity is 60, and a War may have fewer than 60 players.

The guild has a persistent, editable Current Formation. Do not recreate the full lineup every week: keep the core lineup and change only affected players. Starting/finalizing a War creates a historical snapshot.

Duplicate/integrity rules: a player appears at most once in a formation/War, a squad never exceeds six players, and a player marked `LEAVE` cannot be assigned. Enforce important rules in server/database logic as well as in the UI.

### War Builder

Desktop layout: Player Pool grouped by class on the left, Party A in the center, and Party B on the right. Player cards show class indicator/color, player name, and Ultimate icon. Support Pool → Squad, Squad → Squad, A → B, B → A, and remove to Pool. Provide a mobile/touch select-target flow so dragging is not required.

### Ultimate

Ultimate belongs to a War assignment/formation, not permanently to a player. It may be represented by image/icon assets. Preserve the Ultimate used in the War snapshot.

## Historical Wars

Freeze all relevant historical data so edits to the current player, class, or formation cannot change an old War. A snapshot preserves player identity and displayed name, class used, Party, squad, position/order where useful, Ultimate used, attendance, and War results. Former members remain visible. The War History screen displays that War's exact frozen formation and statistics.

## Dashboard

Show Total Active Members, Available, Leave This War, Assigned, Unassigned, Party A, and Party B; a summary for all seven classes; and fill status for A1–A5 and B1–B5. Include leaderboard previews for Top Kills, Assists, Damage, Heal, Damage Taken, Tower Damage, and KDA. Authorized users may see pending account approvals.

## Results and statistics

Manual War result entry must work first. Initial raw statistics: Kills, Deaths, Assists, Damage, Healing, Damage Taken, Tower Damage, and Revives if supported by game data. Do not implement Damage Per Minute. Unless an authoritative game KDA is intentionally stored later, calculate canonical KDA as:

```text
(Kills + Assists) / max(Deaths, 1)
```

Statistics work starting with War #1 and support `THIS WAR`, `LAST 5 WARS`, and `ALL TIME` periods. Leaderboards: Top Kills, Top Assists, Top Damage, Top Heal, Top Damage Taken, Top Tower Damage, and Top KDA. Provide a sortable table with Player, Class, Wars, Kills, Deaths, Assists, KDA, Damage, Heal, Damage Taken, and Tower Damage. Where meaningful, allow Active Members versus Historical/All Players.

### Player profile

Show player name, current/historical membership state, class, Wars played, aggregate statistics, recent Wars, War-by-War performance, and historical Party/squad assignments.

### Screenshot-assisted results (later)

OCR/AI must never write directly into official statistics. Use this review pipeline:

```text
Upload Screenshot → Store Original → Extract Candidate Data → Review → User Corrects → User Confirms → Save Official Stats
```

Keep the extraction implementation provider-replaceable.

## Discord (later)

- Use an official Discord Application/Bot. Never use a self-bot.
- Map Discord User ID explicitly to a Guild Player.
- Prefer `✅ Join War` and `❌ Leave War`; optional commands are `/war-join` and `/war-leave`.
- The website/database remains the source of truth for attendance. Request minimum necessary Discord permissions.

## Visual direction and references

Use screenshots placed in `/reference` as visual direction, not as a pixel-perfect reproduction target. Aim for dark fantasy and modern SaaS: clean, readable, compact, polished, desktop-first, and responsive enough for laptop, tablet, and mobile viewing.

## Phase boundaries

Phase 0 establishes the engineering foundation. Phase 0.5 establishes project memory and handoff documentation. These phases do not implement the product requirements above. Phase 1 is Database and Domain Model; later phases are assigned explicitly and must not be started automatically.
