// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  archiveCsvFiles,
  ForgeDriveBridge,
  createDriveArchive,
  driveInboxRequestSchema,
} from './driveBridge.js';
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
        {
          entityType: 'attachment',
          recordId: 'activity-photo',
          updatedAt: '2026-08-02T02:30:00.000Z',
          deleted: false,
          payload: {
            id: 'activity-photo',
            ownerType: 'activity',
            ownerId: 'activity-1',
            mimeType: 'image/jpeg',
            dataUrl: 'data:image/jpeg;base64,YWJj',
          },
        },
        {
          entityType: 'reminderEvent',
          recordId: 'reminder-1',
          updatedAt: '2026-08-02T02:45:00.000Z',
          deleted: false,
          payload: {
            id: 'reminder-1',
            todoId: 'todo-1',
            title: 'Check tool',
            action: 'Acknowledged',
          },
        },
        {
          entityType: 'documentEvidence',
          recordId: 'course-record',
          updatedAt: '2026-08-02T02:50:00.000Z',
          deleted: false,
          payload: {
            id: 'course-record',
            ownerType: 'skill',
            ownerId: 'skill-1',
            title: 'Course record',
            sourceType: 'Course or transcript',
            sourceName: 'Oregon Tech',
            excerpt: 'Completed relevant coursework.',
            verificationStatus: 'Document-supported',
          },
        },
        {
          entityType: 'mindNode',
          recordId: 'engineering',
          updatedAt: '2026-08-02T02:55:00.000Z',
          deleted: false,
          payload: {
            id: 'engineering',
            title: 'Engineering',
            type: 'knowledge',
            status: 'developing',
            confidence: 50,
            importance: 90,
          },
        },
        {
          entityType: 'mindEdge',
          recordId: 'engineering-skill',
          updatedAt: '2026-08-02T02:56:00.000Z',
          deleted: false,
          payload: {
            id: 'engineering-skill',
            source: { entityType: 'mindNode', entityId: 'engineering' },
            target: { entityType: 'skill', entityId: 'skill-1' },
            relationshipType: 'related to',
          },
        },
      ],
      '2026-08-02T03:00:00.000Z',
    );
    expect(archive.forgeArchiveVersion).toBe(1);
    expect(archive.records.skills).toHaveLength(1);
    expect(archive.records.skills[0]?.archived).toBe(true);
    expect(archive.records.attachments[0]?.driveFile).toBe('Evidence/activity-photo.jpg');
    expect('dataUrl' in (archive.records.attachments[0] ?? {})).toBe(false);
    expect(archive.records.reminderEvents[0]?.action).toBe('Acknowledged');
    expect(archive.records.documentEvidence[0]?.sourceName).toBe('Oregon Tech');
    expect(archiveCsvFiles(archive)['Forge Document Evidence.csv']).toContain('Oregon Tech');
    expect(archive.records.mindNodes[0]?.title).toBe('Engineering');
    expect(archive.records.mindEdges[0]?.target).toEqual({
      entityType: 'skill',
      entityId: 'skill-1',
    });
    expect(archiveCsvFiles(archive)['Forge Mind Nodes.csv']).toContain('Engineering');
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
    expect(readFileSync(join(directory, 'CHATGPT-FORGE-INSTRUCTIONS.md'), 'utf8')).toContain(
      'never invent his identity, values, beliefs',
    );
    expect(existsSync(join(directory, 'Forge Mind Inbox Example.json'))).toBe(true);
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
            checklist: [{ text: 'Set up welder' }, { text: 'Practice one bead' }],
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
        {
          operation: 'save',
          entityType: 'documentEvidence',
          record: {
            id: 'evidence-welding-course',
            ownerType: 'skill',
            ownerId: 'skill-welding',
            title: 'Welding safety course',
            sourceType: 'Course or transcript',
            sourceName: 'Training record',
            excerpt: 'Completed introductory welding safety instruction.',
            verificationStatus: 'Document-supported',
          },
        },
        {
          operation: 'save',
          entityType: 'mindNode',
          record: {
            id: 'mind-welding',
            title: 'Welding knowledge',
            type: 'knowledge',
            description: 'Knowledge structure for welding.',
            status: 'developing',
            confidence: 30,
            importance: 70,
          },
        },
        {
          operation: 'save',
          entityType: 'mindEdge',
          record: {
            id: 'mind-welding-skill',
            source: { entityType: 'mindNode', entityId: 'mind-welding' },
            target: { entityType: 'skill', entityId: 'skill-welding' },
            relationshipType: 'related to',
            notes: 'Links the concept to the existing skill without duplicating it.',
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
    expect(store.archiveRecord(account.id, 'todo', 'todo-practice')?.payload?.checklist).toEqual([
      expect.objectContaining({ text: 'Set up welder', completed: false, id: expect.any(String) }),
      expect.objectContaining({
        text: 'Practice one bead',
        completed: false,
        id: expect.any(String),
      }),
    ]);
    expect(store.archiveRecord(account.id, 'activity', 'activity-welding')?.payload?.title).toBe(
      'Study welding safety',
    );
    expect(
      store.archiveRecord(account.id, 'documentEvidence', 'evidence-welding-course')?.payload
        ?.sourceName,
    ).toBe('Training record');
    expect(store.archiveRecord(account.id, 'mindNode', 'mind-welding')?.payload?.title).toBe(
      'Welding knowledge',
    );
    expect(
      store.archiveRecord(account.id, 'mindEdge', 'mind-welding-skill')?.payload?.target,
    ).toEqual({ entityType: 'skill', entityId: 'skill-welding' });

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
