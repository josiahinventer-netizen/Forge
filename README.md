# Forge

Forge is a local-first personal operating system and self-improvement knowledge graph. It records the user's own skills, resources, work, plans, concepts, and self-model, then connects them without inventing claims or hiding the underlying evidence. Data remains authoritative in the browser's IndexedDB and can be exported as human-readable JSON. No paid service is required.

## Current implementation

- Responsive application shell for mobile and desktop
- Live dashboard counts from IndexedDB
- Skill creation, editing, viewing, search, and archiving
- Separate knowledge and practical skill levels
- Resource creation, editing, viewing, search, quantity/location tracking, and archiving
- Resource intelligence for durable assets and consumables, including manufacturer, model, serial number, lifecycle, maintenance, value, verification status, and evidence notes
- Phone camera/file evidence for resources, skills, and activities, resized before storage, deduplicated per record by SHA-256, synchronized as bounded attachment records, and mirrored into Google Drive for ChatGPT
- Attributed non-image evidence for resources, skills, and activities, including resumes, coursework, certificates, manuals, receipts, web references, excerpts, uncertainty notes, and verification status
- Mind graph with persistent values, beliefs, goals, knowledge concepts, questions, and custom nodes
- First-class semantic relationships between mind nodes and existing skills, resources, capabilities, todos, or activities—without duplicating those records
- Searchable/filterable focused branch explorer showing incoming and outgoing connections
- Purpose-aware todos with priorities, scheduling, due times, duration estimates, reminder lead times, linked Forge records, completion notes, and in-app overdue/reminder banners
- Daily, weekly, and monthly recurring todos that advance after completion while preserving occurrence history
- Opt-in system notifications and browser speech dictation for fast todo capture
- Persistent in-app reminders with acknowledge, snooze, complete, and synchronized reminder history
- Ordered todo checklists for routines and projects, with completion blocking while steps remain,
  preserved recurring snapshots, and fresh unchecked steps for the next occurrence
- Purpose-aware activity/evidence ledger linking real work to existing records, with distinct practice types
- Explainable skill activity summaries and closest-capability next steps without opaque automatic level awards
- Selectable 7-, 30-, and 90-day progress reviews showing study versus practical work, outcomes,
  evidence photos, verification status, explicitly linked capability movement, and plain-language
  comparisons with the preceding period
- Capability creation, editing, detail viewing, search, and archiving
- Skill requirements with separate minimum knowledge and practical levels
- Resource requirements with quantities and units
- Live Available, Partially available, or Blocked calculations
- Structured and plain-language missing requirements with a recommended next step
- Dashboard capability counts derived from current records
- Versioned Dexie schema with tested migrations through schema version 14
- JSON export containing app/schema metadata plus active and archived records
- Validated JSON import with conflict-safe merge and explicitly confirmed replacement
- PWA manifest, service worker, application-shell caching, and offline indicator

Guaranteed closed-app alarms, Bored Mode, health tracking, civilization scoring, knowledge-gap analysis, graph recommendations, and onboarding are not implemented. See [PLAN.md](./PLAN.md) for staged work. In-app reminders and opt-in system notifications work while Forge is allowed to run; browsers and Android may suspend a closed PWA, so Forge does not claim guaranteed closed-app alarm delivery.

## Run locally

```bash
npm install
npm run dev
```

Open the address printed by Vite. Build and preview the installable production PWA with:

```bash
npm run build
npm run preview
```

## Local sync server foundation

Forge includes a user-owned synchronization server connected to the PWA through its Data settings. The default command listens only on `127.0.0.1`; the separate encrypted LAN command can be reached by trusted devices on the same local network.

Start it with:

```bash
npm run server:start
```

After generating trusted local certificates under `%LOCALAPPDATA%\Forge\certs`, encrypted LAN mode can be started with `npm run server:lan`. The current development certificate covers this computer at `192.168.0.187` and `DESKTOP-4712NEU`. The LAN command refuses to start if its certificate or key is missing. The public certificate authority is available locally at `%LOCALAPPDATA%\Forge\certs\rootCA.pem` for installation on trusted devices; its private key must never leave the computer. Never forward port `8787` through the router.

The server creates `%LOCALAPPDATA%\Forge\forge-sync.sqlite` on Windows, outside the repository and its OneDrive folder. `FORGE_DATA_DIR` can override the application-data directory. It provides:

- Multiple isolated local accounts
- Scrypt-hashed passwords and hashed 30-day device sessions
- Incremental skill, resource, and capability changes
- Cursor-based downloads, stale-write protection, and deletion tombstones
- Authenticated change notifications for near-real-time synchronization between open devices
- Preserved stale or same-time conflicting versions in the local `sync_conflicts` archive
- Ten-minute, one-use device pairing codes and one-use account recovery codes
- Account-isolated conflict review that compares changed fields and can deliberately keep the
  current record or restore the preserved version
- Automatic at-most-daily AES-256-GCM snapshots of the local SQLite database, encrypted with a
  computer-local random key
- A strict GitHub Pages origin allowlist

No personal records are stored on GitHub. Google Drive archive mirroring is optional and is enabled on this computer to provide an off-device backup and a ChatGPT-readable bridge; the local SQLite database remains authoritative. After the Android phone trusts the computer's public certificate authority, the PWA can create or sign in to a local account and synchronize while Forge is open. Forge asks browsers not to save or autofill the local-account password; browser password managers remain separately controlled by the user. Forge still needs backup-retention controls. Do not expose port `8787` through a router or firewall.

To connect another phone or browser without typing the account password, open **Data transfer → Computer synchronization** on an already connected device and choose **Pair another device**. On the new device, select **Pairing code**, enter the same local username and computer address, and use the displayed code within ten minutes. A pairing code works only once.

Use **Create recovery codes** to generate eight longer one-use codes for regaining access when no connected device is available. Save them somewhere private and offline when they are displayed: Forge never shows them again, and creating a new set invalidates every unused older code. Pairing and recovery code plaintext is never stored in SQLite, exported, mirrored to Drive, or committed to GitHub; the local server stores only SHA-256 hashes. Anyone holding an unused code and able to reach the local server can connect to that account, so treat the codes like passwords.

### Encrypted computer backups

When the sync server starts, and after later accepted changes, Forge checks whether a daily backup
is due. It serializes SQLite consistently in memory and writes an encrypted, versioned snapshot to
`%LOCALAPPDATA%\Forge\backups`. The random 256-bit key remains at
`%LOCALAPPDATA%\Forge\backup.key`; plaintext database snapshots are never written during backup.
Backups currently accumulate without automatic deletion so normal operation never destroys the
only remaining older copy. Retention controls are still planned.

The encrypted files are unusable without `backup.key`. Back up that key somewhere you physically
control, separate from the repository. Never upload it to GitHub or place it beside shared backup
files.

Recovery is intentionally guarded. Stop the Forge sync server, then run:

```powershell
$env:FORGE_BACKUP_RESTORE = 'confirm'
npm run backup:restore -- 'C:\path\to\forge-sync-....sqlite.enc.json'
Remove-Item Env:FORGE_BACKUP_RESTORE
```

Forge validates authenticated encryption and the SQLite header before replacement. It renames the
current database to a timestamped `forge-sync.sqlite.before-*` file, so the pre-restore state remains
recoverable, and then installs the restored database. Start the sync server again afterward.

## Google Drive and ChatGPT bridge

When Google Drive for desktop is mounted, the encrypted LAN server also checks the configured Forge Drive folder every 10 seconds. The default Windows folder is `G:\My Drive\Forge`; set `FORGE_DRIVE_DIR` to override it and `FORGE_DRIVE_USERNAME` to select a different local Forge account.

The bridge creates:

- `Forge Archive.json` — the current versioned, human-readable archive, including archived records and deletion tombstones.
- `Forge Assistant Context.json` — a compact, versioned projection for ordinary conversational questions; it is regenerated from the archive and is never an independent database.
- `Backups/` — timestamped snapshots created whenever the record set changes or the bridge restarts.
- `Excel/` — separate skills, resources, capabilities, todos, and activities CSV files for local Excel access.
- `CHATGPT-FORGE-INSTRUCTIONS.md` and `Forge Inbox Example.json` — instructions and a request template for ChatGPT.
- `Inbox/` — proposed `forge-request-*.json` files awaiting validation.
- `Processed/` and `Rejected/` — original requests plus machine-readable receipts or errors.
- `Evidence/` — image evidence mirrored from synchronized Forge attachments using stable attachment IDs.

ChatGPT must create a new request file rather than edit `Forge Archive.json`. The inbox accepts version 1 `save` operations for skills, resources, capabilities, todos, and activities. It validates field types, levels, quantities, and linked requirements before writing. It has no delete operation; records can be archived with `archived: true`. Stable request IDs are stored in SQLite so retries and duplicate uploads cannot apply the same request twice. Accepted writes use the normal sync store, appear on other Forge devices through the existing synchronization protocol, and are recorded in the AI audit log.

A clear conversational command such as “add DeWalt reciprocating saw to my tools in Forge” authorizes that non-destructive creation without a second confirmation. ChatGPT should correct obvious spelling and capitalization, check for duplicates, and use conservative defaults without inventing experience or condition. Ambiguous requests and changes to existing records still require clarification or confirmation; an explicit command naming the exact record to archive authorizes that archive operation but never deletion.

`CHATGPT-FORGE-INSTRUCTIONS.md` also defines the initial conversational conventions:

- **Forge this** creates explicitly stated, non-destructive information through one validated Inbox request.
- **Let's forge this through a discussion** explores possibilities without persisting speculative conclusions.
- **Forge what we learned** saves only durable conclusions the user stated or confirmed, not a transcript.
- **What should I do today?** and **What should I learn next?** are read-only reasoning requests grounded in Forge data and explained relationships.
- **What do you know about me?** must distinguish recorded, developing, uncertain, and archived information without inventing personality claims.

The assistant context includes active self-model sections, goals and projects, open todos with purpose and planning metadata, relevant skills, recent activities, open questions, and important graph relationships. Each entry retains stable IDs so ChatGPT can link or update the authoritative record rather than create duplicates. The file declares its projection limits; ChatGPT must read `Forge Archive.json` when an exact question needs omitted or archived data.

Run one synchronization pass manually with:

```bash
npm run drive:sync
```

Google Drive is a replicated backup and ChatGPT bridge, not Forge's only copy. If Drive is unavailable, the PWA and local SQLite synchronization continue to work; Drive processing resumes when the mounted folder returns.

## Publish as an HTTPS PWA

Forge includes `.github/workflows/deploy-pages.yml`. Once this repository is pushed to GitHub and **Settings → Pages → Source** is set to **GitHub Actions**, every push to `main` runs verification, builds the PWA, and updates the same HTTPS address.

For a repository named `Forge`, the default address is:

```text
https://YOUR-GITHUB-USERNAME.github.io/Forge/
```

Routes use URL hashes so direct navigation works from a GitHub Pages project path. Build assets, the manifest, and the service worker use relative paths so the deployment is not tied to one account name.

On Android, open the HTTPS address in Chrome, then choose **Install app** or **Add to Home screen**. Updates are installed through the service worker after a successful deployment; the bookmark or installed icon continues using the same address. IndexedDB data remains stored on that phone and is not uploaded to GitHub.

## Verify

```bash
npm test
npm run lint
npm run format:check
npm run build
```

The automated suite covers browser database creation, record persistence and updates, searching, archiving, schema migration, import/export behavior, capability availability, local account isolation, authentication, and incremental synchronization.

## Capability availability

A capability stores references to existing skill and resource IDs. It does not copy those records. Forge compares current active records with every threshold whenever relevant IndexedDB data changes:

- **Available** — every required skill threshold and resource quantity is met.
- **Partially available** — at least one requirement is met or partly met, but one or more shortfalls remain.
- **Blocked** — no requirement is currently met, or every referenced requirement is missing or archived.

Missing skill levels, missing or archived records, and insufficient quantities are returned as structured data by a pure service and shown in plain language. Availability is derived and is not stored as a permanent score.

## Data ownership

All records are stored locally using Dexie and IndexedDB. Use **Data → Export all data** to download a formatted JSON backup. The export includes:

- Export timestamp
- Application version
- Database schema version
- All skill records
- All resource records
- All capability records
- All bounded evidence attachment records, including their resized image data
- All todo records, schedules, links, purpose, and completion information
- All activity records, outcomes, reflections, links, and structured skill evidence
- All recurring todo completion occurrences
- Reminder detections and acknowledge, snooze, or completion actions

When a device is connected under **Data â†’ Computer synchronization**, Forge observes local record changes and synchronizes them automatically after a short debounce. The computer maintains an authenticated waiting connection that wakes other open Forge devices when changes arrive. Forge also synchronizes at startup, when connectivity returns, and every 30 seconds as a fallback. If the browser suspends or closes the PWA, queued record state converges automatically on its next launch. Passwords are not saved on the device. Exported and imported files are never sent automatically.

## Mind graph foundation

Open **Mind** to create the native concepts that describe the user's self-model or knowledge structure. The first version supports identity, value, belief, principle, goal, interest, knowledge, concept, project, person, experience, habit, question, and custom node types. A node can record description, nuanced notes, tags, status, confidence, importance, optional understanding and practical levels, and attributed document evidence. Forge never seeds values, beliefs, or a technology tree—the graph emerges only from user-entered data and sources.

Relationships are separate `MindEdge` records. Each edge has typed source and target references, a focused semantic vocabulary such as `part of`, `has skill`, `has credential`, `interested in`, `works on`, `pursues`, `wants to learn`, `knows about`, `practices`, `experienced in`, `responsible for`, `supports goal`, `requires`, `prerequisite for`, `supports`, or a custom label, plus notes and archive history. At least one endpoint is a native mind node; the other may be another mind node or an existing Forge skill, resource, capability, todo, or activity. This is how a `Robotics` concept can require the existing `Troubleshooting` skill without creating a second skill copy.

The initial visualization is a responsive focused-branch explorer: select or search a node to see records pointing into it and outward from it. This deliberately stores no required screen coordinates. Canvas layout, pan/zoom, collapse, multi-hop traversal, automatic ontology creation, knowledge-gap recommendations, AI generation, and game-like progression are deferred until the semantic model has more real user data.

Mind nodes and relationships are included in JSON import/export, independent device synchronization, `Forge Archive.json`, Excel-compatible Drive CSV views, validated Drive inbox operations, and local MCP search/get tools. IndexedDB schema 14 adds the two tables without rewriting prior records.

## Attributed document evidence

Open an existing skill, resource, activity, or mind node and use **Document evidence** to record what a resume, transcript or course, certificate, manual, receipt, website, or personal note actually supports. Each entry retains its source or issuer, optional HTTP(S) link and date, relevant excerpt, interpretation limits, and verification status. These entries do not automatically increase skill levels or claim that a document proves hands-on ability. Archive confirmation preserves old evidence in synchronization and JSON history.

Document evidence is stored as a separate stable-ID record in IndexedDB schema 13, synchronized independently, included in JSON transfer, and mirrored into `Forge Archive.json` and `Excel/Forge Document Evidence.csv`. Forge records citations and excerpts rather than copying source documents, so the user remains responsible for retaining the original resume, transcript, receipt, or certificate.

Forge normally resolves the same record using its newest `updatedAt` value. If an older or
same-time-but-different version reaches the computer, the active record remains unchanged and the
rejected version is retained in SQLite's `sync_conflicts` table. Open **Data transfer → Conflicting
edits** to compare readable changed fields. **Keep current** records the decision without deleting
the preserved history. **Restore preserved version** requires confirmation, gives that version a
new update timestamp, and synchronizes it normally to connected devices. Image data is never
printed into the comparison.

## Local ChatGPT and Codex access

Forge includes a local stdio MCP server for AI-assisted archive work. It exposes overview, search, exact-record lookup, confirmed skill/resource/capability saves, and recent audit-log tools. It intentionally exposes no delete tool. Every read and write is recorded in the account-isolated SQLite `ai_audit_log` table.

Run it directly for development with:

```powershell
$env:FORGE_MCP_USERNAME = 'your-local-username'
$env:FORGE_MCP_WRITE = 'enabled'
npm run mcp:start
```

The ChatGPT desktop app or Codex should launch this stdio server rather than expose it on the LAN. Write tools require an explicit `confirm: true` argument and are described to the model as requiring the user's confirmation. The password and device session token are not given to MCP. ChatGPT Remote can use the desktop host's local tools from a paired phone while that computer is awake and online.

### Move data between phone and computer

1. On the source device, open **Data → Export all data**.
2. Save or transfer the JSON file through a location you control, such as a direct USB connection.
3. On the destination device, open **Data → Import JSON backup** and select the file.
4. Choose **Merge with this device** to retain unique records from both devices. When IDs match, Forge keeps the record with the newest `updatedAt` timestamp.
5. Use **Replace this device** only when the selected backup should become the complete local database; Forge asks for confirmation immediately before replacement.

Imports are parsed and fully validated before any IndexedDB write. This remains available as a manual backup and recovery path alongside synchronization.

## Manual smoke checklist

- Add and edit a skill; confirm knowledge and practical levels remain separate.
- Search for the skill, archive it, and confirm it leaves the active list.
- Add and edit a resource; confirm quantity, condition, and location persist.
- Search for the resource, archive it, and confirm it leaves the active list.
- Confirm dashboard counts update without reloading.
- Create a capability with multiple skill and resource requirements.
- Change a linked skill level or resource quantity and confirm capability status updates.
- Archive a required skill or resource and confirm the capability explains the shortfall.
- Create a value, belief, knowledge concept, and custom node in Mind; edit one and archive one.
- Connect two mind nodes, then connect a node to an existing skill and verify both appear in the focused branch.
- Edit and archive a relationship and confirm its record remains in exported history.
- Search and filter Mind nodes at desktop and phone widths.
- Export JSON and confirm active and archived skills, resources, capabilities, mind nodes, and relationships are present.
- Import that file using Merge and confirm records are not duplicated.
- Select Replace, cancel the confirmation, and confirm local records remain unchanged.
- At a narrow viewport, verify every destination remains reachable in the horizontally scrollable bottom navigation.
- Build and serve the production app, go offline, reload, and verify the shell opens.

## Architecture

- `src/database` — Dexie database, schema versions, and migrations
- `src/types` — shared domain and export models
- `src/services` — pure capability availability and JSON export logic
- `src/pages` — dashboard and feature screens
- `src/components` — shared shell and controls
- `src/tests` — database, migration, and export tests

Current app version: **1.0.0**  
Current database schema version: **14**
