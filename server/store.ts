import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import type {
  ArchiveRecord,
  PullResult,
  PushResult,
  SyncChange,
  SyncChangeInput,
  SyncEntityType,
} from './types.js';
import { SYNC_ENTITY_TYPES } from './types.js';

const scrypt = promisify(scryptCallback);
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

interface AccountRow {
  id: string;
  username: string;
  password_hash: string;
  password_salt: string;
}

interface ExistingRecordRow {
  updated_at: string;
  deleted: number;
  payload: string | null;
}

interface ChangeRow {
  revision: number;
  entity_type: string;
  record_id: string;
  updated_at: string;
  deleted: number;
  payload: string | null;
}

const normalizeUsername = (username: string) => username.trim().toLowerCase();
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

async function passwordHash(password: string, salt: Buffer): Promise<Buffer> {
  return (await scrypt(password, salt, 64)) as Buffer;
}

export function validateSyncChange(value: unknown): value is SyncChangeInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const change = value as Record<string, unknown>;
  return (
    typeof change.entityType === 'string' &&
    SYNC_ENTITY_TYPES.includes(change.entityType as (typeof SYNC_ENTITY_TYPES)[number]) &&
    typeof change.recordId === 'string' &&
    change.recordId.length > 0 &&
    typeof change.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(change.updatedAt)) &&
    typeof change.deleted === 'boolean' &&
    (change.payload === null ||
      (typeof change.payload === 'object' &&
        !Array.isArray(change.payload) &&
        change.payload !== null)) &&
    (change.deleted || change.payload !== null)
  );
}

export class ForgeSyncStore {
  readonly database: Database.Database;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path);
    this.database.pragma('foreign_keys = ON');
    this.database.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate() {
    const version = this.database.pragma('user_version', { simple: true }) as number;
    if (version < 1) {
      this.database.exec(`
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE sessions (
          token_hash TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE records (
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          entity_type TEXT NOT NULL,
          record_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted INTEGER NOT NULL,
          payload TEXT,
          revision INTEGER NOT NULL,
          PRIMARY KEY (account_id, entity_type, record_id)
        );
        CREATE TABLE change_log (
          revision INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          entity_type TEXT NOT NULL,
          record_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted INTEGER NOT NULL,
          payload TEXT
        );
        CREATE INDEX change_log_account_revision ON change_log(account_id, revision);
        PRAGMA user_version = 1;
      `);
    }
    if (version < 2) {
      this.database.exec(`
        CREATE TABLE sync_conflicts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          entity_type TEXT NOT NULL,
          record_id TEXT NOT NULL,
          incoming_updated_at TEXT NOT NULL,
          incoming_deleted INTEGER NOT NULL,
          incoming_payload TEXT,
          reason TEXT NOT NULL,
          recorded_at TEXT NOT NULL
        );
        CREATE INDEX sync_conflicts_account_record
          ON sync_conflicts(account_id, entity_type, record_id);
        PRAGMA user_version = 2;
      `);
    }
    if (version < 3) {
      this.database.exec(`
        CREATE TABLE ai_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          tool_name TEXT NOT NULL,
          operation TEXT NOT NULL,
          entity_type TEXT,
          record_id TEXT,
          request_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX ai_audit_log_account_created
          ON ai_audit_log(account_id, created_at);
        PRAGMA user_version = 3;
      `);
    }
  }

  async createAccount(
    username: string,
    password: string,
  ): Promise<{ id: string; username: string }> {
    const normalized = normalizeUsername(username);
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(normalized)) {
      throw new Error(
        'Username must be 3–40 characters using letters, numbers, dots, dashes, or underscores.',
      );
    }
    if (password.length < 12) throw new Error('Password must be at least 12 characters.');
    const id = randomUUID();
    const salt = randomBytes(16);
    const hash = await passwordHash(password, salt);
    try {
      this.database
        .prepare(
          'INSERT INTO accounts (id, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          id,
          normalized,
          hash.toString('base64'),
          salt.toString('base64'),
          new Date().toISOString(),
        );
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new Error('That username already exists.');
      }
      throw error;
    }
    return { id, username: normalized };
  }

  async createSession(
    username: string,
    password: string,
  ): Promise<{ token: string; expiresAt: string }> {
    const account = this.database
      .prepare('SELECT id, username, password_hash, password_salt FROM accounts WHERE username = ?')
      .get(normalizeUsername(username)) as AccountRow | undefined;
    if (!account) throw new Error('Invalid username or password.');
    const candidate = await passwordHash(password, Buffer.from(account.password_salt, 'base64'));
    const expected = Buffer.from(account.password_hash, 'base64');
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
      throw new Error('Invalid username or password.');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
    this.database
      .prepare('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash(token), account.id, expiresAt);
    return { token, expiresAt };
  }

  authenticate(token: string): string | null {
    const row = this.database
      .prepare('SELECT account_id, expires_at FROM sessions WHERE token_hash = ?')
      .get(tokenHash(token)) as { account_id: string; expires_at: string } | undefined;
    if (!row) return null;
    if (Date.parse(row.expires_at) <= Date.now()) {
      this.database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
      return null;
    }
    return row.account_id;
  }

  accountIdForUsername(username: string): string | null {
    const row = this.database
      .prepare('SELECT id FROM accounts WHERE username = ?')
      .get(normalizeUsername(username)) as { id: string } | undefined;
    return row?.id ?? null;
  }

  archiveRecords(
    accountId: string,
    entityTypes: readonly SyncEntityType[] = SYNC_ENTITY_TYPES,
  ): ArchiveRecord[] {
    const placeholders = entityTypes.map(() => '?').join(', ');
    const rows = this.database
      .prepare(
        `SELECT entity_type, record_id, updated_at, deleted, payload FROM records WHERE account_id = ? AND entity_type IN (${placeholders})`,
      )
      .all(accountId, ...entityTypes) as ChangeRow[];
    return rows.map((row) => ({
      entityType: row.entity_type as SyncEntityType,
      recordId: row.record_id,
      updatedAt: row.updated_at,
      deleted: row.deleted === 1,
      payload: row.payload ? (JSON.parse(row.payload) as Record<string, unknown>) : null,
    }));
  }

  archiveRecord(
    accountId: string,
    entityType: SyncEntityType,
    recordId: string,
  ): ArchiveRecord | null {
    return (
      this.archiveRecords(accountId, [entityType]).find((record) => record.recordId === recordId) ??
      null
    );
  }

  recordAudit(
    accountId: string,
    entry: {
      toolName: string;
      operation: 'read' | 'write';
      entityType?: SyncEntityType;
      recordId?: string;
      request: unknown;
      result: unknown;
    },
  ) {
    this.database
      .prepare(
        'INSERT INTO ai_audit_log (account_id, tool_name, operation, entity_type, record_id, request_json, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        accountId,
        entry.toolName,
        entry.operation,
        entry.entityType ?? null,
        entry.recordId ?? null,
        JSON.stringify(entry.request),
        JSON.stringify(entry.result),
        new Date().toISOString(),
      );
  }

  auditCount(accountId: string): number {
    const row = this.database
      .prepare('SELECT COUNT(*) AS count FROM ai_audit_log WHERE account_id = ?')
      .get(accountId) as { count: number };
    return row.count;
  }

  recentAudit(accountId: string, limit = 50): Array<Record<string, unknown>> {
    return this.database
      .prepare(
        'SELECT id, tool_name AS toolName, operation, entity_type AS entityType, record_id AS recordId, created_at AS createdAt FROM ai_audit_log WHERE account_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(accountId, Math.min(Math.max(limit, 1), 100)) as Array<Record<string, unknown>>;
  }

  push(accountId: string, changes: SyncChangeInput[]): PushResult {
    const existingStatement = this.database.prepare(
      'SELECT updated_at, deleted, payload FROM records WHERE account_id = ? AND entity_type = ? AND record_id = ?',
    );
    const conflictStatement = this.database.prepare(
      'INSERT INTO sync_conflicts (account_id, entity_type, record_id, incoming_updated_at, incoming_deleted, incoming_payload, reason, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const logStatement = this.database.prepare(
      'INSERT INTO change_log (account_id, entity_type, record_id, updated_at, deleted, payload) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const recordStatement = this.database.prepare(`
      INSERT INTO records (account_id, entity_type, record_id, updated_at, deleted, payload, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, entity_type, record_id) DO UPDATE SET
        updated_at = excluded.updated_at,
        deleted = excluded.deleted,
        payload = excluded.payload,
        revision = excluded.revision
    `);
    let accepted = 0;
    let ignored = 0;
    let conflictsPreserved = 0;
    const apply = this.database.transaction(() => {
      for (const change of changes) {
        const existing = existingStatement.get(accountId, change.entityType, change.recordId) as
          ExistingRecordRow | undefined;
        const payload = change.payload === null ? null : JSON.stringify(change.payload);
        if (existing && Date.parse(existing.updated_at) >= Date.parse(change.updatedAt)) {
          const sameVersion =
            existing.updated_at === change.updatedAt &&
            existing.deleted === (change.deleted ? 1 : 0) &&
            existing.payload === payload;
          if (!sameVersion) {
            conflictStatement.run(
              accountId,
              change.entityType,
              change.recordId,
              change.updatedAt,
              change.deleted ? 1 : 0,
              payload,
              existing.updated_at === change.updatedAt ? 'same timestamp' : 'stale update',
              new Date().toISOString(),
            );
            conflictsPreserved += 1;
          }
          ignored += 1;
          continue;
        }
        const log = logStatement.run(
          accountId,
          change.entityType,
          change.recordId,
          change.updatedAt,
          change.deleted ? 1 : 0,
          payload,
        );
        recordStatement.run(
          accountId,
          change.entityType,
          change.recordId,
          change.updatedAt,
          change.deleted ? 1 : 0,
          payload,
          Number(log.lastInsertRowid),
        );
        accepted += 1;
      }
    });
    apply();
    return { accepted, ignored, conflictsPreserved, cursor: this.currentCursor(accountId) };
  }

  conflictCount(accountId: string): number {
    const row = this.database
      .prepare('SELECT COUNT(*) AS count FROM sync_conflicts WHERE account_id = ?')
      .get(accountId) as { count: number };
    return row.count;
  }

  pull(accountId: string, cursor: number): PullResult {
    const rows = this.database
      .prepare(
        'SELECT revision, entity_type, record_id, updated_at, deleted, payload FROM change_log WHERE account_id = ? AND revision > ? ORDER BY revision ASC LIMIT 1000',
      )
      .all(accountId, cursor) as ChangeRow[];
    const changes: SyncChange[] = rows.map((row) => ({
      revision: row.revision,
      entityType: row.entity_type as SyncChange['entityType'],
      recordId: row.record_id,
      updatedAt: row.updated_at,
      deleted: row.deleted === 1,
      payload: row.payload ? (JSON.parse(row.payload) as Record<string, unknown>) : null,
    }));
    return { changes, cursor: changes.at(-1)?.revision ?? cursor };
  }

  private currentCursor(accountId: string): number {
    const row = this.database
      .prepare('SELECT COALESCE(MAX(revision), 0) AS cursor FROM change_log WHERE account_id = ?')
      .get(accountId) as { cursor: number };
    return row.cursor;
  }

  close() {
    this.database.close();
  }
}
