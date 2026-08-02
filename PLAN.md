# Forge V1 Implementation Plan

## Stage 1 — First vertical slice (complete)

- [x] React, strict TypeScript, Vite, routing, ESLint, and Prettier foundation
- [x] Dexie/IndexedDB database with stable string IDs
- [x] Versioned schema and tested migration from schema 1 to schema 2
- [x] Shared `Skill`, `Resource`, and export TypeScript models
- [x] Responsive desktop sidebar and mobile bottom navigation
- [x] Dashboard placeholder backed by live skill/resource database counts
- [x] Add, edit, view, search, and archive skills
- [x] Separate knowledge and practical skill levels
- [x] Add, edit, view, search, and archive resources
- [x] Human-readable JSON export containing metadata and all current records
- [x] Automated database, migration, and export tests
- [x] Installable PWA foundation and offline application shell
- [x] Portable GitHub Pages deployment workflow with stable HTTPS updates

## Stage 2 — Capabilities (complete)

- [x] Typed capability records referencing existing skill and resource IDs
- [x] Dexie schema 3 migration that preserves current records
- [x] Create, edit, view, search, and archive capabilities
- [x] Multiple required skills with minimum knowledge and practical levels
- [x] Multiple required resources with quantities and units
- [x] Pure, structured availability assessment service
- [x] Available, Partially available, and Blocked status calculation
- [x] Plain-language missing requirement explanations
- [x] Live recalculation when linked skills or resources change
- [x] One concrete recommended step for unavailable capabilities
- [x] Capability counts on the dashboard
- [x] Capability data in JSON exports
- [x] Availability and migration test coverage

## Stage 3 — Device transfer foundation (complete)

- [x] Validate complete JSON backups before database writes
- [x] Reject malformed records, duplicate IDs, and unsupported future schemas
- [x] Merge records by stable ID while preserving the newest `updatedAt` value
- [x] Replace all local records only after explicit confirmation
- [x] Mobile-friendly import preview and result messaging
- [x] Automated validation, merge, and replacement tests

## Later stages (not started)

1. Actions, timeline, and weekly summaries
2. Bored Mode recommendation engine
3. Knowledge entries and evidence-aware progression scoring
4. Onboarding, themes, and safe local-data clearing
5. Broader offline, accessibility, and device testing

## Stage 4 — User-owned sync server foundation (in progress)

- [x] Free local SQLite storage under an ignored `data/` directory
- [x] Multiple isolated local accounts
- [x] Scrypt password hashing with per-account salts
- [x] Hashed, expiring device session tokens
- [x] Incremental cursor-based skill, resource, and capability changes
- [x] Stale-write protection and deletion tombstones
- [x] Strict account isolation and sync-store tests
- [x] Localhost-only HTTP API with an explicit web-origin allowlist
- [ ] Local HTTPS identity trusted by the computer and Android phone
- [ ] One-time device pairing and recovery codes
- [ ] PWA login and IndexedDB outbox/inbox integration
- [ ] Background retry and visible sync status
- [ ] Encrypted automatic local backups
- [ ] Permission-scoped chat API and audit log

The data layer uses stable IDs and isolated services so future synchronization can be added without replacing feature UI. Capability status is derived rather than stored. Later-stage models and routes are intentionally absent until their implementation stage begins.
