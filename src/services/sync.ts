import { db, type ForgeDatabase } from '../database/db';
import type { Capability, Resource, Skill, SyncSettings } from '../types/models';
import { isCapability, isResource, isSkill } from './dataTransfer';

type EntityType = 'skill' | 'resource' | 'capability';

interface SyncChange {
  revision: number;
  entityType: EntityType;
  recordId: string;
  updatedAt: string;
  deleted: boolean;
  payload: Record<string, unknown> | null;
}

interface PullResponse {
  changes: SyncChange[];
  cursor: number;
}

const isSyncChange = (value: unknown): value is SyncChange => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const change = value as Record<string, unknown>;
  return (
    typeof change.revision === 'number' &&
    Number.isSafeInteger(change.revision) &&
    (change.entityType === 'skill' ||
      change.entityType === 'resource' ||
      change.entityType === 'capability') &&
    typeof change.recordId === 'string' &&
    typeof change.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(change.updatedAt)) &&
    typeof change.deleted === 'boolean' &&
    (change.payload === null ||
      (typeof change.payload === 'object' &&
        change.payload !== null &&
        !Array.isArray(change.payload)))
  );
};

const normalizeServerUrl = (value: string) => value.trim().replace(/\/+$/, '');

async function requestJson(
  url: string,
  options: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetcher(url, options);
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Sync server returned ${response.status}.`;
    throw new Error(message);
  }
  return body;
}

function sessionFrom(value: unknown): { token: string; expiresAt: string } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('token' in value) ||
    !('expiresAt' in value) ||
    typeof value.token !== 'string' ||
    typeof value.expiresAt !== 'string'
  ) {
    throw new Error('The sync server returned an invalid session.');
  }
  return { token: value.token, expiresAt: value.expiresAt };
}

export async function connectDevice(
  serverUrl: string,
  username: string,
  password: string,
  createAccount: boolean,
  database: ForgeDatabase = db,
  fetcher: typeof fetch = fetch,
): Promise<SyncSettings> {
  const normalizedUrl = normalizeServerUrl(serverUrl);
  if (!normalizedUrl.startsWith('https://')) throw new Error('The sync server must use HTTPS.');
  const headers = { 'content-type': 'application/json' };
  if (createAccount) {
    await requestJson(
      `${normalizedUrl}/api/accounts`,
      { method: 'POST', headers, body: JSON.stringify({ username, password }) },
      fetcher,
    );
  }
  const session = sessionFrom(
    await requestJson(
      `${normalizedUrl}/api/sessions`,
      { method: 'POST', headers, body: JSON.stringify({ username, password }) },
      fetcher,
    ),
  );
  const settings: SyncSettings = {
    id: 'primary',
    serverUrl: normalizedUrl,
    username: username.trim().toLowerCase(),
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
    cursor: 0,
  };
  await database.syncSettings.put(settings);
  return settings;
}

const payload = (record: Skill | Resource | Capability): Record<string, unknown> =>
  JSON.parse(JSON.stringify(record)) as Record<string, unknown>;

async function applyChange(database: ForgeDatabase, change: SyncChange) {
  const table =
    change.entityType === 'skill'
      ? database.skills
      : change.entityType === 'resource'
        ? database.resources
        : database.capabilities;
  const existing = await table.get(change.recordId);
  if (existing && Date.parse(existing.updatedAt) > Date.parse(change.updatedAt)) return;
  if (change.deleted) {
    await table.delete(change.recordId);
    return;
  }
  if (change.entityType === 'skill' && isSkill(change.payload))
    await database.skills.put(change.payload);
  else if (change.entityType === 'resource' && isResource(change.payload))
    await database.resources.put(change.payload);
  else if (change.entityType === 'capability' && isCapability(change.payload))
    await database.capabilities.put(change.payload);
  else throw new Error(`The server returned an invalid ${change.entityType} record.`);
}

export async function syncNow(
  database: ForgeDatabase = db,
  fetcher: typeof fetch = fetch,
): Promise<{ pushed: number; pulled: number }> {
  const settings = await database.syncSettings.get('primary');
  if (!settings) throw new Error('Connect this device to the sync server first.');
  if (Date.parse(settings.sessionExpiresAt) <= Date.now())
    throw new Error('Sign in again to sync.');
  const headers = {
    authorization: `Bearer ${settings.sessionToken}`,
    'content-type': 'application/json',
  };
  try {
    const [skills, resources, capabilities] = await Promise.all([
      database.skills.toArray(),
      database.resources.toArray(),
      database.capabilities.toArray(),
    ]);
    const changes = [
      ...skills.map((record) => ({ entityType: 'skill' as const, record })),
      ...resources.map((record) => ({ entityType: 'resource' as const, record })),
      ...capabilities.map((record) => ({ entityType: 'capability' as const, record })),
    ].map(({ entityType, record }) => ({
      entityType,
      recordId: record.id,
      updatedAt: record.updatedAt,
      deleted: false,
      payload: payload(record),
    }));
    await requestJson(
      `${settings.serverUrl}/api/sync/push`,
      { method: 'POST', headers, body: JSON.stringify({ changes }) },
      fetcher,
    );
    const pulled = (await requestJson(
      `${settings.serverUrl}/api/sync/pull?cursor=${settings.cursor}`,
      { headers },
      fetcher,
    )) as PullResponse;
    if (
      !Array.isArray(pulled.changes) ||
      !pulled.changes.every(isSyncChange) ||
      !Number.isSafeInteger(pulled.cursor)
    ) {
      throw new Error('The sync server returned invalid changes.');
    }
    await database.transaction(
      'rw',
      [database.skills, database.resources, database.capabilities, database.syncSettings],
      async () => {
        for (const change of pulled.changes) await applyChange(database, change);
        await database.syncSettings.update('primary', {
          cursor: pulled.cursor,
          lastSyncAt: new Date().toISOString(),
          lastError: undefined,
        });
      },
    );
    return { pushed: changes.length, pulled: pulled.changes.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchronization failed.';
    await database.syncSettings.update('primary', { lastError: message });
    throw error;
  }
}
