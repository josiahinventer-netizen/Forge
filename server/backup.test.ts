// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decryptDatabaseSnapshot,
  EncryptedBackupManager,
  encryptDatabaseSnapshot,
  loadOrCreateBackupKey,
} from './backup.js';

const directories: string[] = [];
const makeDirectory = () => {
  const directory = mkdtempSync(join(tmpdir(), 'forge-backup-test-'));
  directories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('encrypted local backups', () => {
  it('round-trips a SQLite snapshot and rejects the wrong key', () => {
    const database = new Database(':memory:');
    database.exec("CREATE TABLE example (value TEXT); INSERT INTO example VALUES ('Forge');");
    const key = Buffer.alloc(32, 7);
    const envelope = encryptDatabaseSnapshot(database.serialize(), key, '2026-08-03T00:00:00.000Z');

    const restored = new Database(decryptDatabaseSnapshot(envelope, key));
    expect(restored.prepare('SELECT value FROM example').get()).toEqual({ value: 'Forge' });
    expect(() => decryptDatabaseSnapshot(envelope, Buffer.alloc(32, 8))).toThrow();
    restored.close();
    database.close();
  });

  it('creates one encrypted daily snapshot without putting the key in the backup', async () => {
    const directory = makeDirectory();
    const database = new Database(':memory:');
    database.exec('CREATE TABLE example (value TEXT)');
    const keyPath = join(directory, 'backup.key');
    const backupDirectory = join(directory, 'backups');
    const manager = new EncryptedBackupManager(database, backupDirectory, keyPath);
    const now = new Date('2026-08-03T12:00:00.000Z');

    const first = await manager.backupIfDue(now);
    expect(first).toBeTruthy();
    expect(await manager.backupIfDue(new Date(now.getTime() + 60_000))).toBeNull();
    const key = loadOrCreateBackupKey(keyPath);
    const envelope: unknown = JSON.parse(readFileSync(first!, 'utf8'));
    expect(decryptDatabaseSnapshot(envelope, key).subarray(0, 16).toString()).toBe(
      'SQLite format 3\0',
    );
    expect(readFileSync(first!, 'utf8')).not.toContain(key.toString('base64'));
    database.close();
  });
});
