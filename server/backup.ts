import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type Database from 'better-sqlite3';

export const FORGE_BACKUP_VERSION = 1;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface EncryptedBackupEnvelope {
  forgeBackupVersion: 1;
  createdAt: string;
  algorithm: 'aes-256-gcm';
  iv: string;
  authenticationTag: string;
  encryptedDatabase: string;
}

const isEnvelope = (value: unknown): value is EncryptedBackupEnvelope => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    item.forgeBackupVersion === FORGE_BACKUP_VERSION &&
    typeof item.createdAt === 'string' &&
    !Number.isNaN(Date.parse(item.createdAt)) &&
    item.algorithm === 'aes-256-gcm' &&
    typeof item.iv === 'string' &&
    typeof item.authenticationTag === 'string' &&
    typeof item.encryptedDatabase === 'string'
  );
};

export function loadBackupKey(keyPath: string): Buffer {
  if (!existsSync(keyPath)) throw new Error('Forge backup key was not found.');
  const key = readFileSync(keyPath);
  if (key.length !== 32) throw new Error('Forge backup key must contain exactly 32 bytes.');
  return key;
}

export function loadOrCreateBackupKey(keyPath: string): Buffer {
  if (existsSync(keyPath)) return loadBackupKey(keyPath);
  mkdirSync(dirname(keyPath), { recursive: true });
  const key = randomBytes(32);
  try {
    writeFileSync(keyPath, key, { flag: 'wx', mode: 0o600 });
    return key;
  } catch (error) {
    if (existsSync(keyPath)) return loadOrCreateBackupKey(keyPath);
    throw error;
  }
}

export function encryptDatabaseSnapshot(
  snapshot: Uint8Array,
  key: Uint8Array,
  createdAt = new Date().toISOString(),
): EncryptedBackupEnvelope {
  if (key.byteLength !== 32) throw new Error('Forge backup encryption requires a 256-bit key.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(snapshot), cipher.final()]);
  return {
    forgeBackupVersion: FORGE_BACKUP_VERSION,
    createdAt,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authenticationTag: cipher.getAuthTag().toString('base64'),
    encryptedDatabase: encrypted.toString('base64'),
  };
}

export function decryptDatabaseSnapshot(value: unknown, key: Uint8Array): Buffer {
  if (!isEnvelope(value)) throw new Error('This is not a supported Forge encrypted backup.');
  if (key.byteLength !== 32) throw new Error('Forge backup decryption requires a 256-bit key.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.authenticationTag, 'base64'));
  const snapshot = Buffer.concat([
    decipher.update(Buffer.from(value.encryptedDatabase, 'base64')),
    decipher.final(),
  ]);
  if (!snapshot.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) {
    throw new Error('The decrypted backup is not a SQLite database.');
  }
  return snapshot;
}

export class EncryptedBackupManager {
  private active: Promise<string | null> | null = null;

  constructor(
    private readonly database: Database.Database,
    private readonly backupDirectory: string,
    private readonly keyPath: string,
  ) {}

  backupIfDue(now = new Date()): Promise<string | null> {
    if (this.active) return this.active;
    this.active = Promise.resolve()
      .then(() => {
        mkdirSync(this.backupDirectory, { recursive: true });
        const latest = readdirSync(this.backupDirectory)
          .filter((name) => /^forge-sync-.*\.sqlite\.enc\.json$/.test(name))
          .sort()
          .at(-1);
        if (latest) {
          try {
            const previous: unknown = JSON.parse(
              readFileSync(join(this.backupDirectory, latest), 'utf8'),
            );
            if (
              isEnvelope(previous) &&
              now.getTime() - Date.parse(previous.createdAt) < BACKUP_INTERVAL_MS
            )
              return null;
          } catch {
            // A damaged backup never prevents creation of a new recoverable snapshot.
          }
        }
        const key = loadOrCreateBackupKey(this.keyPath);
        const envelope = encryptDatabaseSnapshot(this.database.serialize(), key, now.toISOString());
        const safeTime = envelope.createdAt.replaceAll(':', '-');
        const destination = join(this.backupDirectory, `forge-sync-${safeTime}.sqlite.enc.json`);
        writeFileSync(destination, `${JSON.stringify(envelope)}\n`, { flag: 'wx', mode: 0o600 });
        return destination;
      })
      .finally(() => {
        this.active = null;
      });
    return this.active;
  }
}

export function restoreEncryptedBackup(
  backupPath: string,
  databasePath: string,
  keyPath: string,
  confirmed: boolean,
): string {
  if (!confirmed) throw new Error('Set FORGE_BACKUP_RESTORE=confirm to authorize restoration.');
  const key = loadBackupKey(keyPath);
  const envelope: unknown = JSON.parse(readFileSync(backupPath, 'utf8'));
  const snapshot = decryptDatabaseSnapshot(envelope, key);
  mkdirSync(dirname(databasePath), { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const previousPath = join(dirname(databasePath), `${basename(databasePath)}.before-${timestamp}`);
  const temporaryPath = `${databasePath}.restore-${timestamp}.tmp`;
  writeFileSync(temporaryPath, snapshot, { flag: 'wx', mode: 0o600 });
  if (existsSync(databasePath)) renameSync(databasePath, previousPath);
  renameSync(temporaryPath, databasePath);
  return previousPath;
}
