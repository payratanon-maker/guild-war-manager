# Guild War Manager — Agent Rules

- Treat this as production software, not a disposable prototype.
- At the start of every phase, read `AGENTS.md`, `docs/PROJECT_STATE.md`, and `docs/PHASE_HANDOFF.md`.
- Then read only the relevant sections of `docs/PROJECT_SPEC.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md`.
- Inspect existing implementation and tests before changing a feature. Continue completed work; rebuild it only for a concrete reason.
- Repository documentation is the source of truth when chat context is stale or conflicts with it.
- Complete the assigned phase autonomously. Normal build, test, and type errors are fix-and-continue work, not blockers.
- Do not silently change an approved product decision. Record durable decisions in `docs/DECISIONS.md`.
- Run relevant formatting, lint, typecheck, tests, and production build before declaring completion; review the implementation and fix relevant findings.
- At the end of every phase, update `docs/PROJECT_STATE.md` and replace `docs/PHASE_HANDOFF.md` with the current handoff. Update architecture only when it changes, and the spec only when an approved requirement changes.
- Do not automatically start the next numbered phase. A later phase may require a different model or explicit direction.
- Stop only for a genuine external blocker that cannot be resolved from the repository, tools, existing files, or reasonable engineering judgment; report what is needed and what is complete.

## Future phase startup

1. Read `AGENTS.md`.
2. Read `docs/PROJECT_STATE.md`.
3. Read `docs/PHASE_HANDOFF.md`.
4. Read relevant sections of `docs/PROJECT_SPEC.md`.
5. Read relevant sections of `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`.
6. Inspect implementation and tests related to the phase.
7. Continue existing work instead of rebuilding it.
