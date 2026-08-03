# Forge Repository Working Rules

These rules apply to every task in this repository. Read `PLAN.md`, `README.md`, and the relevant source and tests before making changes.

## Product direction

Forge is a local-first real-life character progression and capability application.

Its purpose is to help the user:

- Replace passive phone use with meaningful activity.
- Track actual skills, resources, actions, knowledge, and capabilities.
- Understand what they can presently build, repair, produce, or learn.
- Receive useful suggestions based on available time, energy, interest, and resources.
- Own and export all personal data.
- Eventually operate offline and sync with a user-owned computer server.

Implement this direction in the stages recorded in `PLAN.md`. Do not treat later product goals as authorization to build them early.

## Engineering rules

- Preserve offline-first operation.
- Do not add paid cloud services.
- Do not add user accounts or a backend unless explicitly requested.
- Keep strict TypeScript enabled.
- Avoid `any`. If an exceptional boundary truly requires it, document why and contain it at that boundary.
- Keep database, business logic, and UI logic separated.
- Use existing project patterns before introducing new libraries or architectures.
- Do not remove working features merely to simplify a new implementation.
- Never change the database schema without adding or updating a Dexie migration and its tests.
- Never make scoring claims that cannot be explained from underlying data.
- Never award major skill progress based solely on passive consumption.
- Do not use medically authoritative language or claim to diagnose ADHD or predict lifespan.
- Maintain mobile usability and desktop usability.
- Maintain accessible labels, keyboard support, visible focus states, and mobile-appropriate touch target sizes.

## Data safety

- Do not destroy or reset user data during normal upgrades.
- Validate imports before reading records into the database.
- Require explicit confirmation immediately before destructive actions.
- Keep a schema version in every export format, including after export-format changes.
- Do not store secrets or private data in the repository.
- Do not commit `.env` files, generated exports, database dumps, or personal information.
- Treat stable record IDs, timestamps, archived records, and migration paths as user-owned data that must be preserved.

## Task workflow

For every substantial feature:

1. Inspect the relevant existing files, tests, `PLAN.md`, and `README.md`.
2. Briefly explain the intended implementation before editing.
3. Make the smallest coherent implementation.
4. Add or update tests for changed behavior and migration paths.
5. Run the complete verification suite below.
6. Fix every failure before reporting completion.
7. Summarize files changed, behavior added, test results, and known limitations.
8. Update `PLAN.md` whenever project status changes.
9. Update `README.md` when setup, usage, architecture, commands, or implemented behavior changes.
10. Do not begin unrelated future features.

## Required verification

After every implementation task, run all of these commands from the repository root:

```bash
npm test
npm run lint
npm run format:check
npx tsc -b
npm run build
```

The commands map to the current repository as follows:

- Tests: `npm test` runs `vitest run`.
- ESLint: `npm run lint` runs `eslint .`.
- Prettier check: `npm run format:check` runs `prettier --check .`.
- Strict TypeScript check: `npx tsc -b` uses the root project references and the strict settings in `tsconfig.app.json` and `tsconfig.node.json`.
- Production build: `npm run build` runs `tsc -b && vite build`. This intentionally repeats the TypeScript check while verifying the production bundle and PWA output.

Fix all failures before reporting completion. Do not describe a task as complete when any required command is failing.

## Current npm script reference

- `npm run dev` — start the Vite development server.
- `npm run build` — run the TypeScript project build and create the Vite production bundle.
- `npm run preview` — serve the production build locally for inspection.
- `npm run server:start` — run the localhost-only Forge Sync Server and local SQLite database.
- `npm run server:lan` — run the TLS-configured LAN server using certificates under the local Forge application-data directory; never use it before device trust is configured.
- `npm run mcp:start` — run Forge's local stdio MCP server; requires `FORGE_MCP_USERNAME` and uses `FORGE_MCP_WRITE=enabled` to permit confirmed writes.
- `npm run drive:sync` — run one Google Drive archive/inbox synchronization pass; uses `FORGE_DRIVE_DIR` and `FORGE_DRIVE_USERNAME` when provided.
- `npm run backup:restore -- <file>` — restore an authenticated encrypted SQLite snapshot only when
  the sync server is stopped and `FORGE_BACKUP_RESTORE=confirm` is set; preserves the previous
  database beside the restored one.
- `npm test` — run the Vitest suite once.
- `npm run test:watch` — run Vitest in watch mode during development.
- `npm run lint` — run ESLint across the repository.
- `npm run format` — rewrite supported files with Prettier; use intentionally, then inspect changes.
- `npm run format:check` — verify Prettier formatting without rewriting files.

## Current architectural boundaries

- `src/database` owns Dexie schema definitions, versions, and migrations.
- `src/types` owns shared persistent-data and transfer types.
- `src/services` owns non-UI business operations such as export creation.
- `src/pages` owns route-level presentation and user interaction.
- `src/components` owns shared UI and application-shell components.
- `src/tests` owns automated database, migration, and service verification.
- `server` owns the user-hosted HTTP API, account authentication, SQLite persistence, and sync protocol.

Keep these boundaries intact unless a concrete requirement demonstrates that a small, documented adjustment is necessary.
