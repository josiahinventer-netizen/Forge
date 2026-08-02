import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForgeDatabase } from '../database/db';
import { connectDevice, syncNow } from '../services/sync';
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
    await database.skills.put(local);
    await database.syncSettings.put({
      id: 'primary',
      serverUrl: 'https://computer.local:8787',
      username: 'josiah',
      sessionToken: 'token',
      sessionExpiresAt: '2099-01-01T00:00:00.000Z',
      cursor: 0,
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ accepted: 1, ignored: 0, cursor: 1 }))
      .mockResolvedValueOnce(
        jsonResponse({
          changes: [
            {
              revision: 1,
              entityType: 'skill',
              recordId: newer.id,
              updatedAt: newer.updatedAt,
              deleted: false,
              payload: newer,
            },
          ],
          cursor: 1,
        }),
      );

    const result = await syncNow(database, fetcher);

    expect(result).toEqual({ pushed: 1, pulled: 1 });
    expect((await database.skills.get('carpentry'))?.practicalLevel).toBe(3);
    expect((await database.syncSettings.get('primary'))?.cursor).toBe(1);
    const pushedBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      changes: Array<{ recordId: string }>;
    };
    expect(pushedBody.changes[0]?.recordId).toBe('carpentry');
  });
});
