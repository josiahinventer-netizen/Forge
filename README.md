# Forge

Forge is a local-first personal development PWA. It records skills and resources, then uses those records to calculate what the user may currently be capable of doing. Data remains in the browser's IndexedDB and can be exported as human-readable JSON. No account, backend, or paid service is required.

## Current implementation

- Responsive application shell for mobile and desktop
- Live dashboard counts from IndexedDB
- Skill creation, editing, viewing, search, and archiving
- Separate knowledge and practical skill levels
- Resource creation, editing, viewing, search, quantity/location tracking, and archiving
- Capability creation, editing, detail viewing, search, and archiving
- Skill requirements with separate minimum knowledge and practical levels
- Resource requirements with quantities and units
- Live Available, Partially available, or Blocked calculations
- Structured and plain-language missing requirements with a recommended next step
- Dashboard capability counts derived from current records
- Versioned Dexie schema with tested migrations through schema version 3
- JSON export containing app/schema metadata plus active and archived records
- Validated JSON import with conflict-safe merge and explicitly confirmed replacement
- PWA manifest, service worker, application-shell caching, and offline indicator

Actions, Bored Mode, health tracking, civilization scoring, AI, automatic server synchronization, knowledge entries, and onboarding are not implemented. See [PLAN.md](./PLAN.md) for staged work.

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

Forge includes an early user-owned synchronization server. It is not connected to the PWA yet and intentionally listens only on `127.0.0.1`, so it cannot currently be reached by a phone or another computer.

Start it with:

```bash
npm run server:start
```

The server creates `data/forge-sync.sqlite`, which is ignored by Git. It provides:

- Multiple isolated local accounts
- Scrypt-hashed passwords and hashed 30-day device sessions
- Incremental skill, resource, and capability changes
- Cursor-based downloads, stale-write protection, and deletion tombstones
- A strict GitHub Pages origin allowlist

No personal records are stored on GitHub or a third-party data service. Before LAN access is enabled, Forge still needs a trusted local HTTPS identity, device pairing, PWA sync queues, visible status, backups, and recovery tools. Do not expose port `8787` through a router or firewall.

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

Automatic synchronization is deliberately deferred. Exported and imported files are never sent anywhere by Forge.

### Move data between phone and computer

1. On the source device, open **Data → Export all data**.
2. Save or share the JSON file through a location you control, such as OneDrive or USB.
3. On the destination device, open **Data → Import JSON backup** and select the file.
4. Choose **Merge with this device** to retain unique records from both devices. When IDs match, Forge keeps the record with the newest `updatedAt` timestamp.
5. Use **Replace this device** only when the selected backup should become the complete local database; Forge asks for confirmation immediately before replacement.

Imports are parsed and fully validated before any IndexedDB write. This is manual device transfer, not automatic synchronization.

## Manual smoke checklist

- Add and edit a skill; confirm knowledge and practical levels remain separate.
- Search for the skill, archive it, and confirm it leaves the active list.
- Add and edit a resource; confirm quantity, condition, and location persist.
- Search for the resource, archive it, and confirm it leaves the active list.
- Confirm dashboard counts update without reloading.
- Create a capability with multiple skill and resource requirements.
- Change a linked skill level or resource quantity and confirm capability status updates.
- Archive a required skill or resource and confirm the capability explains the shortfall.
- Export JSON and confirm active and archived skills, resources, and capabilities are present.
- Import that file using Merge and confirm records are not duplicated.
- Select Replace, cancel the confirmation, and confirm local records remain unchanged.
- At a narrow viewport, verify all five destinations appear in the bottom navigation.
- Build and serve the production app, go offline, reload, and verify the shell opens.

## Architecture

- `src/database` — Dexie database, schema versions, and migrations
- `src/types` — shared domain and export models
- `src/services` — pure capability availability and JSON export logic
- `src/pages` — dashboard and feature screens
- `src/components` — shared shell and controls
- `src/tests` — database, migration, and export tests

Current app version: **1.0.0**  
Current database schema version: **3**
