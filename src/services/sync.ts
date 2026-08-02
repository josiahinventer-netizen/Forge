import { liveQuery } from 'dexie';
import { db, type ForgeDatabase } from '../database/db';
import type {
  Capability,
  Activity,
  EvidenceAttachment,
  Resource,
  Skill,
  SyncSettings,
  Todo,
  TodoOccurrence,
  ReminderEvent,
} from '../types/models';
import {
  isActivity,
  isAttachment,
  isCapability,
  isResource,
  isSkill,
  isTodo,
  isTodoOccurrence,
  isReminderEvent,
} from './dataTransfer';

type EntityType =
  | 'skill'
  | 'resource'
  | 'capability'
  | 'attachment'
  | 'todo'
  | 'activity'
  | 'todoOccurrence'
  | 'reminderEvent';

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

interface PushResponse {
  accepted: number;
  ignored: number;
  conflictsPreserved: number;
  cursor: number;
}

function pushBatches(changes: Omit<SyncChange, 'revision'>[]) {
  const batches: Array<Omit<SyncChange, 'revision'>[]> = [];
  let batch: Omit<SyncChange, 'revision'>[] = [];
  let bytes = 0;
  for (const change of changes) {
    const changeBytes = new TextEncoder().encode(JSON.stringify(change)).byteLength;
    if (changeBytes > 700_000) throw new Error('One synchronized record exceeds 700 KB.');
    if (batch.length && bytes + changeBytes > 700_000) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(change);
    bytes += changeBytes;
  }
  if (batch.length || !batches.length) batches.push(batch);
  return batches;
}

const isSyncChange = (value: unknown): value is SyncChange => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const change = value as Record<string, unknown>;
  return (
    typeof change.revision === 'number' &&
    Number.isSafeInteger(change.revision) &&
    (change.entityType === 'skill' ||
      change.entityType === 'resource' ||
      change.entityType === 'capability' ||
      change.entityType === 'attachment' ||
      change.entityType === 'todo' ||
      change.entityType === 'activity' ||
      change.entityType === 'todoOccurrence' ||
      change.entityType === 'reminderEvent') &&
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

const payload = (
  record:
    | Skill
    | Resource
    | Capability
    | EvidenceAttachment
    | Todo
    | Activity
    | TodoOccurrence
    | ReminderEvent,
): Record<string, unknown> => JSON.parse(JSON.stringify(record)) as Record<string, unknown>;

async function applyChange(database: ForgeDatabase, change: SyncChange) {
  const existing =
    change.entityType === 'skill'
      ? await database.skills.get(change.recordId)
      : change.entityType === 'resource'
        ? await database.resources.get(change.recordId)
        : change.entityType === 'capability'
          ? await database.capabilities.get(change.recordId)
          : change.entityType === 'attachment'
            ? await database.attachments.get(change.recordId)
            : change.entityType === 'todo'
              ? await database.todos.get(change.recordId)
              : change.entityType === 'activity'
                ? await database.activities.get(change.recordId)
                : change.entityType === 'todoOccurrence'
                  ? await database.todoOccurrences.get(change.recordId)
                  : await database.reminderEvents.get(change.recordId);
  if (existing && Date.parse(existing.updatedAt) > Date.parse(change.updatedAt)) return;
  if (change.deleted) {
    if (change.entityType === 'skill') await database.skills.delete(change.recordId);
    else if (change.entityType === 'resource') await database.resources.delete(change.recordId);
    else if (change.entityType === 'capability')
      await database.capabilities.delete(change.recordId);
    else if (change.entityType === 'attachment') await database.attachments.delete(change.recordId);
    else if (change.entityType === 'todo') await database.todos.delete(change.recordId);
    else if (change.entityType === 'activity') await database.activities.delete(change.recordId);
    else if (change.entityType === 'todoOccurrence')
      await database.todoOccurrences.delete(change.recordId);
    else await database.reminderEvents.delete(change.recordId);
    return;
  }
  if (change.entityType === 'skill' && isSkill(change.payload))
    await database.skills.put(change.payload);
  else if (change.entityType === 'resource' && isResource(change.payload))
    await database.resources.put(change.payload);
  else if (change.entityType === 'capability' && isCapability(change.payload))
    await database.capabilities.put(change.payload);
  else if (change.entityType === 'attachment' && isAttachment(change.payload))
    await database.attachments.put(change.payload);
  else if (change.entityType === 'todo' && isTodo(change.payload))
    await database.todos.put(change.payload);
  else if (change.entityType === 'activity' && isActivity(change.payload))
    await database.activities.put(change.payload);
  else if (change.entityType === 'todoOccurrence' && isTodoOccurrence(change.payload))
    await database.todoOccurrences.put(change.payload);
  else if (change.entityType === 'reminderEvent' && isReminderEvent(change.payload))
    await database.reminderEvents.put(change.payload);
  else throw new Error(`The server returned an invalid ${change.entityType} record.`);
}

const activeSyncs = new WeakMap<ForgeDatabase, Promise<{ pushed: number; pulled: number }>>();

async function performSync(
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
    const [
      skills,
      resources,
      capabilities,
      attachments,
      todos,
      activities,
      todoOccurrences,
      reminderEvents,
    ] = await Promise.all([
      database.skills.toArray(),
      database.resources.toArray(),
      database.capabilities.toArray(),
      database.attachments.toArray(),
      database.todos.toArray(),
      database.activities.toArray(),
      database.todoOccurrences.toArray(),
      database.reminderEvents.toArray(),
    ]);
    const changes = [
      ...skills.map((record) => ({ entityType: 'skill' as const, record })),
      ...resources.map((record) => ({ entityType: 'resource' as const, record })),
      ...capabilities.map((record) => ({ entityType: 'capability' as const, record })),
      ...attachments.map((record) => ({ entityType: 'attachment' as const, record })),
      ...todos.map((record) => ({ entityType: 'todo' as const, record })),
      ...activities.map((record) => ({ entityType: 'activity' as const, record })),
      ...todoOccurrences.map((record) => ({ entityType: 'todoOccurrence' as const, record })),
      ...reminderEvents.map((record) => ({ entityType: 'reminderEvent' as const, record })),
    ].map(({ entityType, record }) => ({
      entityType,
      recordId: record.id,
      updatedAt: record.updatedAt,
      deleted: false,
      payload: payload(record),
    }));
    const pushed: PushResponse = { accepted: 0, ignored: 0, conflictsPreserved: 0, cursor: 0 };
    for (const batch of pushBatches(changes)) {
      const result = (await requestJson(
        `${settings.serverUrl}/api/sync/push`,
        { method: 'POST', headers, body: JSON.stringify({ changes: batch }) },
        fetcher,
      )) as PushResponse;
      if (
        !Number.isSafeInteger(result.accepted) ||
        !Number.isSafeInteger(result.ignored) ||
        !Number.isSafeInteger(result.conflictsPreserved) ||
        !Number.isSafeInteger(result.cursor)
      )
        throw new Error('The sync server returned an invalid push result.');
      pushed.accepted += result.accepted;
      pushed.ignored += result.ignored;
      pushed.conflictsPreserved += result.conflictsPreserved;
      pushed.cursor = Math.max(pushed.cursor, result.cursor);
    }

    let pullCursor = pushed.conflictsPreserved > 0 ? 0 : settings.cursor;
    const pulledChanges: SyncChange[] = [];
    while (true) {
      const pulled = (await requestJson(
        `${settings.serverUrl}/api/sync/pull?cursor=${pullCursor}`,
        { headers },
        fetcher,
      )) as PullResponse;
      if (
        !Array.isArray(pulled.changes) ||
        !pulled.changes.every(isSyncChange) ||
        !Number.isSafeInteger(pulled.cursor) ||
        pulled.cursor < pullCursor
      ) {
        throw new Error('The sync server returned invalid changes.');
      }
      pulledChanges.push(...pulled.changes);
      pullCursor = pulled.cursor;
      if (pulled.changes.length < 1000) break;
    }
    await database.transaction(
      'rw',
      [
        database.skills,
        database.resources,
        database.capabilities,
        database.attachments,
        database.todos,
        database.activities,
        database.todoOccurrences,
        database.reminderEvents,
        database.syncSettings,
      ],
      async () => {
        for (const change of pulledChanges) await applyChange(database, change);
        await database.syncSettings.update('primary', {
          cursor: pullCursor,
          lastSyncAt: new Date().toISOString(),
          lastError: undefined,
        });
      },
    );
    return { pushed: changes.length, pulled: pulledChanges.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchronization failed.';
    await database.syncSettings.update('primary', { lastError: message });
    throw error;
  }
}

export function syncNow(
  database: ForgeDatabase = db,
  fetcher: typeof fetch = fetch,
): Promise<{ pushed: number; pulled: number }> {
  const active = activeSyncs.get(database);
  if (active) return active;
  const operation = performSync(database, fetcher).finally(() => activeSyncs.delete(database));
  activeSyncs.set(database, operation);
  return operation;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export function startAutomaticSync(
  database: ForgeDatabase = db,
  fetcher: typeof fetch = fetch,
): () => void {
  let stopped = false;
  let debounceTimer: number | undefined;
  const abortController = new AbortController();

  const synchronize = async () => {
    if (stopped || !navigator.onLine || !(await database.syncSettings.get('primary'))) return;
    try {
      await syncNow(database, fetcher);
    } catch {
      // syncNow records the visible error and the next local, remote, online, or timer event retries.
    }
  };
  const schedule = (delay = 600) => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void synchronize(), delay);
  };

  const records = liveQuery(async () => {
    const [
      skills,
      resources,
      capabilities,
      attachments,
      todos,
      activities,
      todoOccurrences,
      reminderEvents,
    ] = await Promise.all([
      database.skills.toArray(),
      database.resources.toArray(),
      database.capabilities.toArray(),
      database.attachments.toArray(),
      database.todos.toArray(),
      database.activities.toArray(),
      database.todoOccurrences.toArray(),
      database.reminderEvents.toArray(),
    ]);
    return [
      ...skills,
      ...resources,
      ...capabilities,
      ...attachments,
      ...todos,
      ...activities,
      ...todoOccurrences,
      ...reminderEvents,
    ]
      .map((record) => `${record.id}:${record.updatedAt}`)
      .sort()
      .join('|');
  }).subscribe({ next: () => schedule(), error: () => schedule(3_000) });

  const watchComputer = async () => {
    while (!stopped) {
      const settings = await database.syncSettings.get('primary');
      if (!settings || !navigator.onLine) {
        await wait(2_000);
        continue;
      }
      try {
        const result = await requestJson(
          `${settings.serverUrl}/api/sync/wait?cursor=${settings.cursor}`,
          {
            headers: { authorization: `Bearer ${settings.sessionToken}` },
            signal: abortController.signal,
          },
          fetcher,
        );
        if (
          typeof result === 'object' &&
          result !== null &&
          'changed' in result &&
          result.changed === true
        ) {
          await synchronize();
        }
      } catch {
        if (abortController.signal.aborted) return;
        await wait(3_000);
      }
    }
  };

  void watchComputer();
  const fallbackTimer = window.setInterval(() => schedule(0), 30_000);
  const onOnline = () => schedule(0);
  window.addEventListener('online', onOnline);
  schedule(0);

  return () => {
    stopped = true;
    records.unsubscribe();
    abortController.abort();
    window.clearTimeout(debounceTimer);
    window.clearInterval(fallbackTimer);
    window.removeEventListener('online', onOnline);
  };
}
