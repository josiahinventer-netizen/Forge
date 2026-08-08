// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { ForgeSyncStore, validateSyncChange } from './store.js';
import { createForgeServer } from './http.js';

const stores: ForgeSyncStore[] = [];
const makeStore = () => {
  const store = new ForgeSyncStore(':memory:');
  stores.push(store);
  return store;
};

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

describe('ForgeSyncStore accounts', () => {
  it('migrates the local server database through access-code schema version 6', () => {
    const store = makeStore();
    expect(store.database.pragma('user_version', { simple: true })).toBe(6);
    expect(
      store.database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drive_inbox_receipts'",
        )
        .get(),
    ).toBeTruthy();
    expect(
      store.database
        .prepare("SELECT name FROM pragma_table_info('sync_conflicts') WHERE name = 'resolution'")
        .get(),
    ).toBeTruthy();
    expect(
      store.database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'device_pairing_codes'",
        )
        .get(),
    ).toBeTruthy();
    expect(
      store.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recovery_codes'")
        .get(),
    ).toBeTruthy();
  });

  it('issues expiring one-time pairing codes without storing their plaintext', async () => {
    const store = makeStore();
    const account = await store.createAccount('Josiah', 'long secure password');
    await store.createAccount('SomeoneElse', 'another secure password');
    const pairing = store.createPairingCode(account.id);

    expect(pairing.code).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/);
    expect(Date.parse(pairing.expiresAt)).toBeGreaterThan(Date.now());
    expect(
      JSON.stringify(store.database.prepare('SELECT * FROM device_pairing_codes').all()),
    ).not.toContain(pairing.code.replaceAll('-', ''));
    expect(() => store.exchangePairingCode('someoneelse', pairing.code)).toThrow(
      'Invalid or expired pairing code.',
    );

    const session = store.exchangePairingCode('josiah', pairing.code.toLowerCase());
    expect(store.authenticate(session.token)).toBe(account.id);
    expect(() => store.exchangePairingCode('josiah', pairing.code)).toThrow(
      'Invalid or expired pairing code.',
    );

    const expired = store.createPairingCode(account.id);
    store.database.prepare('UPDATE device_pairing_codes SET expires_at = ?').run('2000-01-01');
    expect(() => store.exchangePairingCode('josiah', expired.code)).toThrow(
      'Invalid or expired pairing code.',
    );
  });

  it('consumes recovery codes once and invalidates an older set on rotation', async () => {
    const store = makeStore();
    const account = await store.createAccount('Josiah', 'long secure password');
    const firstSet = store.createRecoveryCodes(account.id);

    expect(firstSet).toHaveLength(8);
    expect(new Set(firstSet).size).toBe(8);
    expect(
      JSON.stringify(store.database.prepare('SELECT * FROM recovery_codes').all()),
    ).not.toContain(firstSet[0]?.replaceAll('-', ''));
    const session = store.exchangeRecoveryCode('josiah', firstSet[0] ?? '');
    expect(store.authenticate(session.token)).toBe(account.id);
    expect(() => store.exchangeRecoveryCode('josiah', firstSet[0] ?? '')).toThrow(
      'Invalid or already used recovery code.',
    );

    const secondSet = store.createRecoveryCodes(account.id);
    expect(() => store.exchangeRecoveryCode('josiah', firstSet[1] ?? '')).toThrow(
      'Invalid or already used recovery code.',
    );
    expect(store.authenticate(store.exchangeRecoveryCode('josiah', secondSet[0] ?? '').token)).toBe(
      account.id,
    );
  });

  it('creates separate accounts and authenticates expiring device sessions', async () => {
    const store = makeStore();
    const first = await store.createAccount('Josiah', 'long secure password');
    const second = await store.createAccount('Builder', 'another secure password');
    const session = await store.createSession('josiah', 'long secure password');

    expect(first.username).toBe('josiah');
    expect(second.id).not.toBe(first.id);
    expect(store.authenticate(session.token)).toBe(first.id);
    await expect(store.createSession('josiah', 'wrong password')).rejects.toThrow(
      'Invalid username or password.',
    );
  });

  it('rejects duplicate usernames and weak passwords', async () => {
    const store = makeStore();
    await store.createAccount('forge-user', 'long secure password');

    await expect(store.createAccount('FORGE-USER', 'another secure password')).rejects.toThrow(
      'already exists',
    );
    await expect(store.createAccount('short', 'tiny')).rejects.toThrow('at least 12 characters');
  });
});

describe('Forge server network safety', () => {
  it('refuses non-loopback binding without TLS', () => {
    expect(() =>
      createForgeServer({ databasePath: ':memory:', host: '0.0.0.0', port: 8787 }),
    ).toThrow('refuses non-loopback access without a TLS certificate and key');
  });
});

describe('incremental account-isolated synchronization', () => {
  it('pushes and pulls changes only for the authenticated account', async () => {
    const store = makeStore();
    const first = await store.createAccount('first-user', 'long secure password');
    const second = await store.createAccount('second-user', 'long secure password');
    const change = {
      entityType: 'resource' as const,
      recordId: 'hammer',
      updatedAt: '2026-08-02T12:00:00.000Z',
      deleted: false,
      payload: { id: 'hammer', name: 'Claw hammer', quantity: 1 },
    };

    expect(store.push(first.id, [change])).toMatchObject({ accepted: 1, ignored: 0 });
    expect(store.pull(first.id, 0).changes).toMatchObject([change]);
    expect(store.pull(second.id, 0).changes).toEqual([]);
  });

  it('uses cursors, ignores stale writes, and synchronizes tombstones', async () => {
    const store = makeStore();
    const account = await store.createAccount('sync-user', 'long secure password');
    const newest = {
      entityType: 'skill' as const,
      recordId: 'carpentry',
      updatedAt: '2026-08-03T12:00:00.000Z',
      deleted: false,
      payload: { id: 'carpentry', name: 'Carpentry', practicalLevel: 3 },
    };
    const pushed = store.push(account.id, [newest]);
    const duplicate = store.push(account.id, [newest]);
    const stale = store.push(account.id, [
      { ...newest, updatedAt: '2026-08-01T12:00:00.000Z', payload: { name: 'Old' } },
    ]);
    const deletion = store.push(account.id, [
      {
        ...newest,
        updatedAt: '2026-08-04T12:00:00.000Z',
        deleted: true,
        payload: null,
      },
    ]);

    expect(duplicate).toMatchObject({ accepted: 0, ignored: 1, cursor: pushed.cursor });
    expect(stale).toMatchObject({ accepted: 0, ignored: 1, cursor: pushed.cursor });
    expect(stale.conflictsPreserved).toBe(1);
    expect(store.conflictCount(account.id)).toBe(1);
    expect(deletion.cursor).toBeGreaterThan(pushed.cursor);
    expect(store.pull(account.id, pushed.cursor).changes).toEqual([
      expect.objectContaining({ recordId: 'carpentry', deleted: true, payload: null }),
    ]);
  });

  it('lists account-isolated conflicts and retains resolution history', async () => {
    const store = makeStore();
    const first = await store.createAccount('conflict-user', 'long secure password');
    const second = await store.createAccount('other-user', 'long secure password');
    const current = {
      entityType: 'resource' as const,
      recordId: 'saw',
      updatedAt: '2026-08-03T12:00:00.000Z',
      deleted: false,
      payload: { id: 'saw', name: 'Current saw', updatedAt: '2026-08-03T12:00:00.000Z' },
    };
    store.push(first.id, [current]);
    store.push(first.id, [
      {
        ...current,
        updatedAt: '2026-08-02T12:00:00.000Z',
        payload: { id: 'saw', name: 'Preserved saw', updatedAt: '2026-08-02T12:00:00.000Z' },
      },
    ]);

    const [conflict] = store.conflicts(first.id);
    expect(conflict).toMatchObject({
      recordId: 'saw',
      incomingPayload: { name: 'Preserved saw' },
      current: { payload: { name: 'Current saw' } },
    });
    expect(store.conflicts(second.id)).toEqual([]);

    const result = store.resolveConflict(first.id, conflict!.id, 'restored-preserved');
    expect(result.restored).toBe(true);
    expect(store.conflicts(first.id)).toEqual([]);
    expect(store.conflicts(first.id, true)[0]).toMatchObject({
      resolution: 'restored-preserved',
      resolvedAt: expect.any(String),
    });
    expect(store.archiveRecord(first.id, 'resource', 'saw')?.payload).toMatchObject({
      name: 'Preserved saw',
      updatedAt: expect.any(String),
    });
  });

  it('notifies a waiting authenticated device when another device pushes a change', async () => {
    const forgeServer = createForgeServer({
      databasePath: ':memory:',
      host: '127.0.0.1',
      port: 0,
    });
    try {
      const address = await forgeServer.start();
      const baseUrl = `http://127.0.0.1:${address.port}`;
      await fetch(`${baseUrl}/api/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'waiting-user', password: 'long secure password' }),
      });
      const sessionResponse = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'waiting-user', password: 'long secure password' }),
      });
      const session = (await sessionResponse.json()) as { token: string };
      const headers = {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      };
      const waiting = fetch(`${baseUrl}/api/sync/wait?cursor=0`, { headers });
      await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          changes: [
            {
              entityType: 'resource',
              recordId: 'saw',
              updatedAt: '2026-08-02T13:00:00.000Z',
              deleted: false,
              payload: { id: 'saw', name: 'Circular saw' },
            },
          ],
        }),
      });

      expect(await (await waiting).json()).toEqual({ changed: true });
    } finally {
      await forgeServer.stop();
    }
  });

  it('serves authenticated conflict review and resolution endpoints', async () => {
    const forgeServer = createForgeServer({
      databasePath: ':memory:',
      host: '127.0.0.1',
      port: 0,
    });
    try {
      const address = await forgeServer.start();
      const baseUrl = `http://127.0.0.1:${address.port}`;
      await fetch(`${baseUrl}/api/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'review-user', password: 'long secure password' }),
      });
      const sessionResponse = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'review-user', password: 'long secure password' }),
      });
      const session = (await sessionResponse.json()) as { token: string };
      const headers = {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      };
      const change = {
        entityType: 'skill',
        recordId: 'typing',
        updatedAt: '2026-08-03T12:00:00.000Z',
        deleted: false,
        payload: { id: 'typing', name: 'Touch typing' },
      };
      await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ changes: [change] }),
      });
      await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          changes: [{ ...change, updatedAt: '2026-08-01T12:00:00.000Z' }],
        }),
      });

      const listResponse = await fetch(`${baseUrl}/api/sync/conflicts`, { headers });
      const list = (await listResponse.json()) as { conflicts: Array<{ id: number }> };
      expect(listResponse.status).toBe(200);
      expect(list.conflicts).toHaveLength(1);

      const resolution = await fetch(
        `${baseUrl}/api/sync/conflicts/${list.conflicts[0]!.id}/resolve`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ resolution: 'kept-current' }),
        },
      );
      expect(resolution.status).toBe(200);
      expect(await (await fetch(`${baseUrl}/api/sync/conflicts`, { headers })).json()).toEqual({
        conflicts: [],
      });
    } finally {
      await forgeServer.stop();
    }
  });

  it('validates sync changes before database access', () => {
    expect(
      validateSyncChange({
        entityType: 'capability',
        recordId: 'build-pwa',
        updatedAt: '2026-08-02T12:00:00.000Z',
        deleted: false,
        payload: { id: 'build-pwa' },
      }),
    ).toBe(true);
    expect(
      validateSyncChange({
        entityType: 'documentEvidence',
        recordId: 'course-record',
        updatedAt: '2026-08-02T12:00:00.000Z',
        deleted: false,
        payload: { id: 'course-record', ownerType: 'skill', ownerId: 'mechanical-engineering' },
      }),
    ).toBe(true);
    expect(
      validateSyncChange({
        entityType: 'unknown',
        recordId: '',
        updatedAt: 'later',
        deleted: false,
        payload: null,
      }),
    ).toBe(false);
  });
});

describe('Forge AI audit storage', () => {
  it('records account-isolated AI reads and writes', async () => {
    const store = makeStore();
    const first = await store.createAccount('audit-user', 'long secure password');
    const second = await store.createAccount('other-audit-user', 'long secure password');

    store.recordAudit(first.id, {
      toolName: 'forge_search',
      operation: 'read',
      request: { query: 'carpentry' },
      result: { matchCount: 1 },
    });

    expect(store.auditCount(first.id)).toBe(1);
    expect(store.auditCount(second.id)).toBe(0);
    expect(store.recentAudit(first.id)).toEqual([
      expect.objectContaining({ toolName: 'forge_search', operation: 'read' }),
    ]);
  });
});
