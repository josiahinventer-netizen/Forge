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

## Stage 7 — Activity evidence and explainable progress (foundation complete)

- [x] Create, edit, view, search, and archive purpose-aware activities
- [x] Link activities to existing skills, resources, capabilities, and todos
- [x] Distinguish study, guided practice, independent application, troubleshooting, and teaching
- [x] Pure skill-evidence summaries that do not silently award levels
- [x] Dashboard activity count and closest-capability explanations
- [x] Dexie schema 8 migration, device sync, JSON export, and Drive archive/CSV
- [ ] Evidence history with multiple attributed document sources
- [x] Explainable seven-day summaries and guided manual level-review suggestions

## Later stages (not started)

1. Longer-term activity trends beyond the implemented selectable 7-, 30-, and 90-day comparison
2. Bored Mode recommendation engine
3. Knowledge entries and evidence-aware progression scoring
4. Onboarding, themes, and safe local-data clearing
5. Broader offline, accessibility, and device testing

## Stage 5 — Resource intelligence (in progress)

- [x] Typed asset/consumable classification and verification status
- [x] Manufacturer, model, serial number, lifecycle, maintenance, and value metadata
- [x] Dexie schema 5 migration preserving existing resources
- [x] Drive inbox and local MCP support for richer resource metadata
- [x] Resource editing interface for identification and lifecycle fields
- [x] Bounded phone camera and serial-label evidence capture
- [x] Independently synchronized, hash-deduplicated attachment records
- [x] Google Drive evidence-file mirroring for ChatGPT access
- [x] Reusable typed photo evidence with source notes and verification status for resources, skills, and activities
- [x] Per-record hash deduplication, galleries, and confirmed evidence archiving
- [ ] Non-image evidence history with multiple attributed document sources
- [x] Explainable capability-work connections based only on explicitly linked activities

## Stage 6 — Purpose-aware todos (foundation complete)

- [x] Create, edit, search, complete, and archive todos
- [x] Required purpose field explaining why a task matters
- [x] Priority, scheduled start, due time, duration estimate, and reminder lead time
- [x] Links to existing skills, resources, and capabilities by stable ID
- [x] Completion notes and completion timestamps
- [x] Pure overdue, reminder-due, upcoming, and ordering service with tests
- [x] Visible in-app reminder while Forge is open
- [x] Dashboard open and overdue counts
- [x] Dexie schema 7 migration, device sync, JSON export, Drive archive/CSV, and AI tools
- [x] Recurring task occurrences that retain completion history
- [x] Opt-in best-effort OS notifications with clear Android suspension limitations
- [x] Browser speech dictation for fast todo title, purpose, and detail entry
- [x] Persistent reminder detection with acknowledge, ten-minute snooze, and complete actions
- [x] Synchronized reminder history so missed reminders survive app restarts
- [x] Ordered todo checklists with live step completion, recurring reset, and preserved snapshots

## Stage 4 — User-owned sync server foundation (in progress)

- [x] Free local SQLite storage under an ignored `data/` directory
- [x] Multiple isolated local accounts
- [x] Scrypt password hashing with per-account salts
- [x] Hashed, expiring device session tokens
- [x] Incremental cursor-based skill, resource, and capability changes
- [x] Stale-write protection and deletion tombstones
- [x] Strict account isolation and sync-store tests
- [x] Localhost-only HTTP API with an explicit web-origin allowlist
- [x] Local HTTPS identity generated and trusted by the computer
- [x] Keep the sync database and private TLS key outside the OneDrive-hosted repository
- [x] Install the local HTTPS certificate authority on the Android phone
- [ ] One-time device pairing and recovery codes
- [x] PWA local-account sign-in and IndexedDB push/pull integration
- [x] Foreground automatic retry and visible sync status
- [x] Immediate local-edit detection and authenticated server change notifications
- [x] Preserve rejected conflicting record versions in the local SQLite archive
- [x] Conflict-history review and manual resolution UI
- [x] Encrypted automatic local SQLite backups with guarded recovery tooling
- [x] Permission-scoped local MCP read/write tools and account-isolated AI audit log
- [x] Versioned Google Drive archive snapshots with Excel-compatible CSV views
- [x] Validated, idempotent Google Drive inbox for confirmed ChatGPT save requests
- [x] Automatic Drive bridge polling while the local HTTPS sync server runs
- [ ] Retention controls and encryption for long-term cloud backup history

The data layer uses stable IDs and isolated services so future synchronization can be added without replacing feature UI. Capability status is derived rather than stored. Later-stage models and routes are intentionally absent until their implementation stage begins.
