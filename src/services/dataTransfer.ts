import { db, SCHEMA_VERSION, type ForgeDatabase } from '../database/db';
import type { ExportBundle } from '../types/models';

declare const __APP_VERSION__: string;

export async function createExport(database: ForgeDatabase = db): Promise<ExportBundle> {
  return {
    exportDate: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    schemaVersion: SCHEMA_VERSION,
    records: {
      skills: await database.skills.toArray(),
      resources: await database.resources.toArray(),
      capabilities: await database.capabilities.toArray(),
    },
  };
}

export function downloadExport(bundle: ExportBundle) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `forge-backup-${bundle.exportDate.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
