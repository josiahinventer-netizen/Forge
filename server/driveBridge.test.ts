// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ForgeDriveBridge, createDriveArchive, driveInboxRequestSchema } from './driveBridge.js';
import { ForgeSyncStore } from './store.js';

const directories: string[] = [];
const stores: ForgeSyncStore[] = [];
const setup = async () => {
  const directory = mkdtempSync(join(tmpdir(), 'forge-drive-'));
  directories.push(directory);
  const store = new ForgeSyncStore(':memory:');
  stores.push(store);
  const account = await store.createAccount('josiahv', 'long secure password');
  return { directory, store, account };
};

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('Drive archive', () => {
  it('creates a versioned snapshot while preserving archived records and tombstones', () => {
    const archive = createDriveArchive(
      'josiahv',
      [
        {
          entityType: 'skill',
          recordId: 'skill-1',
          updatedAt: '2026-08-02T01:00:00.000Z',
          deleted: false,
          payload: { id: 'skill-1', name: 'Carpentry', archived: true },
        },
        {
          entityType: 'resource',
          recordId: 'old',
          updatedAt: '2026-08-02T02:00:00.000Z',
          deleted: true,
          payload: null,
        },
      ],
      '2026-08-02T03:00:00.000Z',
    );
    expect(archive.forgeArchiveVersion).toBe(1);
    expect(archive.records.skills).toHaveLength(1);
    expect(archive.records.skills[0]?.archived).toBe(true);
    expect(archive.deletedRecords).toEqual([
      { entityType: 'resource', recordId: 'old', updatedAt: '2026-08-02T02:00:00.000Z' },
    ]);
  });
});

describe('Drive inbox', () => {
  it('rejects unsupported or destructive operations', () => {
    expect(() =>
      driveInboxRequestSchema.parse({
        forgeInboxVersion: 1,
        requestId: 'request-1',
        createdAt: new Date().toISOString(),
        summary: 'Delete it',
        operations: [
          { operation: 'delete', entityType: 'skill', record: { id: 'skill-1', name: 'Skill' } },
        ],
      }),
    ).toThrow();
  });

  it('processes a valid request once and writes snapshots and receipts', async () => {
    const { directory, store, account } = await setup();
    const bridge = new ForgeDriveBridge({ driveDirectory: directory, username: 'josiahv', store });
    bridge.initialize();
    expect(readFileSync(join(directory, 'CHATGPT-FORGE-INSTRUCTIONS.md'), 'utf8')).toContain(
      'authorizes one non-destructive create request',
    );
    const request = {
      forgeInboxVersion: 1,
      requestId: 'request-1',
      createdAt: new Date().toISOString(),
      summary: 'Add welding',
      operations: [
        {
          operation: 'save',
          entityType: 'skill',
          record: {
            id: 'skill-welding',
            name: 'Welding',
            category: 'Fabrication',
            knowledgeLevel: 1,
            practicalLevel: 0,
          },
        },
        {
          operation: 'save',
          entityType: 'todo',
          record: {
            id: 'todo-practice',
            title: 'Practice welding',
            purpose: 'Build practical skill',
            priority: 'High',
          },
        },
        {
          operation: 'save',
          entityType: 'activity',
          record: {
            id: 'activity-welding',
            title: 'Study welding safety',
            purpose: 'Prepare for safe practical work',
            occurredAt: '2026-08-02T12:00:00.000Z',
            durationMinutes: 30,
            skillPractice: [
              {
                skillId: 'skill-welding',
                kind: 'Study',
                minutes: 30,
                verificationStatus: 'Activity-supported',
              },
            ],
          },
        },
      ],
    };
    writeFileSync(join(directory, 'Inbox', 'forge-request-welding.json'), JSON.stringify(request));
    expect(bridge.runOnce().inbox).toEqual([
      { file: 'forge-request-welding.json', status: 'processed' },
    ]);
    expect(store.archiveRecord(account.id, 'skill', 'skill-welding')?.payload?.name).toBe(
      'Welding',
    );
    expect(
      JSON.parse(readFileSync(join(directory, 'Forge Archive.json'), 'utf8')).records.skills,
    ).toHaveLength(1);
    expect(store.driveInboxReceipt(account.id, 'request-1')?.status).toBe('processed');
    expect(store.archiveRecord(account.id, 'todo', 'todo-practice')?.payload?.purpose).toBe(
      'Build practical skill',
    );
    expect(store.archiveRecord(account.id, 'activity', 'activity-welding')?.payload?.title).toBe(
      'Study welding safety',
    );

    writeFileSync(
      join(directory, 'Inbox', 'forge-request-duplicate.json'),
      JSON.stringify(request),
    );
    expect(bridge.processInbox()).toEqual([
      { file: 'forge-request-duplicate.json', status: 'duplicate' },
    ]);
    expect(store.archiveRecords(account.id, ['skill'])).toHaveLength(1);
  });

  it('rejects capabilities whose linked requirements do not exist', async () => {
    const { directory, store } = await setup();
    const bridge = new ForgeDriveBridge({ driveDirectory: directory, username: 'josiahv', store });
    bridge.initialize();
    writeFileSync(
      join(directory, 'Inbox', 'forge-request-invalid.json'),
      JSON.stringify({
        forgeInboxVersion: 1,
        requestId: 'request-invalid',
        createdAt: new Date().toISOString(),
        summary: 'Invalid capability',
        operations: [
          {
            operation: 'save',
            entityType: 'capability',
            record: {
              name: 'Impossible',
              requiredSkills: [
                { skillId: 'missing', minimumKnowledgeLevel: 1, minimumPracticalLevel: 1 },
              ],
            },
          },
        ],
      }),
    );
    expect(bridge.processInbox()).toEqual([
      { file: 'forge-request-invalid.json', status: 'rejected' },
    ]);
    expect(
      store.archiveRecords(store.accountIdForUsername('josiahv')!, ['capability']),
    ).toHaveLength(0);
  });
});
