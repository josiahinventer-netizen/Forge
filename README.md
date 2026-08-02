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
- PWA manifest, service worker, application-shell caching, and offline indicator

Actions, Bored Mode, health tracking, civilization scoring, AI, server synchronization, knowledge entries, onboarding, and JSON import are not implemented. See [PLAN.md](./PLAN.md) for staged work.

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

The automated suite covers database creation, record persistence and updates, searching, archiving, schema migration, export completeness, and capability availability edge cases.

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

Import and synchronization are deliberately deferred. Exported data is not sent anywhere by Forge.

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
