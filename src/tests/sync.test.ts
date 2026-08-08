import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForgeDatabase } from '../database/db';
import {
  connectDevice,
  connectWithAccessCode,
  createPairingCode,
  createRecoveryCodes,
  listSyncConflicts,
  resolveSyncConflict,
  syncNow,
} from '../services/sync';
import type { Skill } from '../types/models';

const databases: ForgeDatabase[] = [];
const makeDatabase = () => {
  const database = new ForgeDatabase(`forge-sync-test-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe('device synchronization', () => {
  it('stores a session without storing the password', async () => {
    const database = makeDatabase();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'account-1', username: 'josiah' }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ token: 'device-token', expiresAt: '2099-01-01T00:00:00.000Z' }),
      );

    await connectDevice(
      'https://192.168.0.187:8787/',
      'Josiah',
      'a long local password',
      true,
      database,
      fetcher,
    );

    expect(await database.syncSettings.get('primary')).toEqual(
      expect.objectContaining({
        serverUrl: 'https://192.168.0.187:8787',
        username: 'josiah',
        sessionToken: 'device-token',
        cursor: 0,
      }),
    );
    expect(JSON.stringify(await database.syncSettings.toArray())).not.toContain(
      'a long local password',
    );
  });

  it('connects with a one-time access code without storing that code', async () => {
    const database = makeDatabase();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ token: 'paired-token', expiresAt: '2099-01-01T00:00:00.000Z' }),
      );

    await connectWithAccessCode(
      'https://computer.local:8787/',
      'Josiah',
      'ABCD-EFGH-JKLM',
      'pairing',
      database,
      fetcher,
    );

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://computer.local:8787/api/pairing/exchange');
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ username: 'Josiah', code: 'ABCD-EFGH-JKLM' }),
    );
    expect(JSON.stringify(await database.syncSettings.toArray())).not.toContain('ABCD-EFGH-JKLM');
    expect(await database.syncSettings.get('primary')).toMatchObject({
      username: 'josiah',
      sessionToken: 'paired-token',
    });
  });

  it('requests pairing and recovery codes with the current authenticated session', async () => {
    const database = makeDatabase();
    await database.syncSettings.put({
      id: 'primary',
      serverUrl: 'https://computer.local:8787',
      username: 'josiah',
      sessionToken: 'current-token',
      sessionExpiresAt: '2099-01-01T00:00:00.000Z',
      cursor: 0,
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ code: 'ABCD-EFGH-JKLM', expiresAt: '2099-01-01T00:10:00.000Z' }, 201),
      )
      .mockResolvedValueOnce(jsonResponse({ codes: ['ABCD-EFGH-JKLM-NPQR'] }, 201));

    expect(await createPairingCode(database, fetcher)).toEqual({
      code: 'ABCD-EFGH-JKLM',
      expiresAt: '2099-01-01T00:10:00.000Z',
    });
    expect(await createRecoveryCodes(database, fetcher)).toEqual(['ABCD-EFGH-JKLM-NPQR']);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ authorization: 'Bearer current-token' });
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ confirm: true }));
  });

  it('pushes local records and applies newer records pulled from the computer', async () => {
    const database = makeDatabase();
    const local: Skill = {
      id: 'carpentry',
      name: 'Carpentry',
      description: '',
      category: 'Making',
      knowledgeLevel: 1,
      practicalLevel: 1,
      confidence: 50,
      evidenceNotes: '',
      evidenceLinks: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      archived: false,
    };
    const newer = { ...local, practicalLevel: 3 as const, updatedAt: '2026-02-01T00:00:00.000Z' };
    const attachment = {
      id: 'photo-1',
      ownerType: 'skill' as const,
      ownerId: local.id,
      kind: 'Project result' as const,
      fileName: 'result.jpg',
      mimeType: 'image/jpeg' as const,
      byteSize: 3,
      width: 1,
      height: 1,
      sha256: 'b'.repeat(64),
      dataUrl: 'data:image/jpeg;base64,YWJj',
      verificationStatus: 'Confirmed' as const,
      notes: '',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      tags: [],
      archived: false,
    };
    const activity = {
      id: 'activity-1',
      title: 'Repair practice',
      description: '',
      purpose: 'Improve carpentry',
      occurredAt: '2026-02-02T00:00:00.000Z',
      durationMinutes: 30,
      outcome: 'Joint repaired',
      reflection: '',
      skillPractice: [
        {
          skillId: local.id,
          kind: 'Troubleshooting' as const,
          minutes: 30,
          verificationStatus: 'Activity-supported' as const,
          notes: '',
        },
      ],
      linkedResourceIds: [],
      linkedCapabilityIds: [],
      linkedTodoIds: [],
      createdAt: '2026-02-02T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
      tags: [],
      archived: false,
    };
    const occurrence = {
      id: 'occurrence-1',
      todoId: 'routine',
      title: 'Routine',
      purpose: 'Consistency',
      completedAt: '2026-02-03T00:00:00.000Z',
      completionNotes: 'Done',
      createdAt: '2026-02-03T00:00:00.000Z',
      updatedAt: '2026-02-03T00:00:00.000Z',
      tags: [],
      archived: false,
    };
    const reminderEvent = {
      id: 'reminder-1',
      todoId: 'routine',
      occurrenceKey: 'routine:2026-02-03',
      title: 'Routine',
      purpose: 'Consistency',
      detectedAt: '2026-02-03T00:00:00.000Z',
      createdAt: '2026-02-03T00:00:00.000Z',
      updatedAt: '2026-02-03T00:00:00.000Z',
      tags: [],
      archived: false,
    };
    await database.skills.put(local);
    await database.syncSettings.put({
      id: 'primary',
      serverUrl: 'https://computer.local:8787',
      username: 'josiah',
      sessionToken: 'token',
      sessionExpiresAt: '2099-01-01T00:00:00.000Z',
      cursor: 5,
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accepted: 0, ignored: 1, conflictsPreserved: 1, cursor: 6 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          changes: [
            {
              revision: 6,
              entityType: 'skill',
              recordId: newer.id,
              updatedAt: newer.updatedAt,
              deleted: false,
              payload: newer,
            },
            {
              revision: 7,
              entityType: 'attachment',
              recordId: attachment.id,
              updatedAt: attachment.updatedAt,
              deleted: false,
              payload: attachment,
            },
            {
              revision: 8,
              entityType: 'activity',
              recordId: activity.id,
              updatedAt: activity.updatedAt,
              deleted: false,
              payload: activity,
            },
            {
              revision: 9,
              entityType: 'todoOccurrence',
              recordId: occurrence.id,
              updatedAt: occurrence.updatedAt,
              deleted: false,
              payload: occurrence,
            },
            {
              revision: 10,
              entityType: 'reminderEvent',
              recordId: reminderEvent.id,
              updatedAt: reminderEvent.updatedAt,
              deleted: false,
              payload: reminderEvent,
            },
          ],
          cursor: 10,
        }),
      );

    const result = await syncNow(database, fetcher);

    expect(result).toEqual({ pushed: 1, pulled: 5 });
    expect((await database.skills.get('carpentry'))?.practicalLevel).toBe(3);
    expect((await database.syncSettings.get('primary'))?.cursor).toBe(10);
    expect((await database.attachments.get('photo-1'))?.ownerId).toBe('carpentry');
    expect((await database.activities.get('activity-1'))?.skillPractice[0]?.kind).toBe(
      'Troubleshooting',
    );
    expect((await database.todoOccurrences.get('occurrence-1'))?.todoId).toBe('routine');
    expect((await database.reminderEvents.get('reminder-1'))?.purpose).toBe('Consistency');
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://computer.local:8787/api/sync/pull?cursor=0');
    const pushedBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      changes: Array<{ recordId: string }>;
    };
    expect(pushedBody.changes[0]?.recordId).toBe('carpentry');
  });

  it('loads and resolves authenticated conflict history', async () => {
    const database = makeDatabase();
    await database.syncSettings.put({
      id: 'primary',
      serverUrl: 'https://computer.local:8787',
      username: 'josiah',
      sessionToken: 'token',
      sessionExpiresAt: '2099-01-01T00:00:00.000Z',
      cursor: 0,
    });
    const conflict = {
      id: 7,
      entityType: 'skill',
      recordId: 'typing',
      incomingUpdatedAt: '2026-08-01T00:00:00.000Z',
      incomingDeleted: false,
      incomingPayload: { id: 'typing', name: 'Typing' },
      reason: 'stale update',
      recordedAt: '2026-08-02T00:00:00.000Z',
      resolvedAt: null,
      resolution: null,
      current: {
        entityType: 'skill',
        recordId: 'typing',
        updatedAt: '2026-08-02T00:00:00.000Z',
        deleted: false,
        payload: { id: 'typing', name: 'Touch typing' },
      },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ conflicts: [conflict] }))
      .mockResolvedValueOnce(jsonResponse({ conflict: { ...conflict, resolvedAt: 'now' } }));

    expect(await listSyncConflicts(false, database, fetcher)).toEqual([conflict]);
    await resolveSyncConflict(7, 'kept-current', database, fetcher);

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://computer.local:8787/api/sync/conflicts');
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://computer.local:8787/api/sync/conflicts/7/resolve',
    );
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ resolution: 'kept-current' }));
  });
});
