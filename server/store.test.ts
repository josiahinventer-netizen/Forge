// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { ForgeSyncStore, validateSyncChange } from './store.js';

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

    expect(stale).toMatchObject({ accepted: 0, ignored: 1, cursor: pushed.cursor });
    expect(deletion.cursor).toBeGreaterThan(pushed.cursor);
    expect(store.pull(account.id, pushed.cursor).changes).toEqual([
      expect.objectContaining({ recordId: 'carpentry', deleted: true, payload: null }),
    ]);
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
        entityType: 'unknown',
        recordId: '',
        updatedAt: 'later',
        deleted: false,
        payload: null,
      }),
    ).toBe(false);
  });
});
