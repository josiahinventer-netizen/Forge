// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  archiveCsvFiles,
  createAssistantContext,
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

  it('creates a compact deterministic assistant context from authoritative active records', () => {
    const archive = createDriveArchive(
      'josiahv',
      [
        {
          entityType: 'mindNode',
          recordId: 'goal-robotics',
          updatedAt: '2026-08-02T01:00:00.000Z',
          deleted: false,
          payload: {
            id: 'goal-robotics',
            title: 'Build robotics systems',
            type: 'goal',
            status: 'active',
            confidence: 80,
            importance: 95,
            archived: false,
          },
        },
        {
          entityType: 'mindNode',
          recordId: 'old-goal',
          updatedAt: '2026-08-02T01:00:00.000Z',
          deleted: false,
          payload: { id: 'old-goal', title: 'Old goal', type: 'goal', archived: true },
        },
        {
          entityType: 'todo',
          recordId: 'todo-controls',
          updatedAt: '2026-08-02T01:00:00.000Z',
          deleted: false,
          payload: {
            id: 'todo-controls',
            title: 'Study feedback control',
            purpose: 'Support the robotics goal',
            status: 'Open',
            priority: 'High',
            estimatedMinutes: 45,
            dueAt: '2026-08-03T03:00:00.000Z',
            execution: {
              workState: 'actionable',
              deadlineKind: 'hard',
              blockedBy: [],
              contexts: ['computer'],
            },
            archived: false,
          },
        },
        {
          entityType: 'todo',
          recordId: 'todo-waiting',
          updatedAt: '2026-08-02T01:00:00.000Z',
          deleted: false,
          payload: {
            id: 'todo-waiting',
            title: 'External review',
            purpose: 'Await a decision',
            status: 'Open',
            priority: 'Urgent',
            archived: false,
            execution: {
              workState: 'waiting',
              waitingOn: 'External reviewer',
              blockedBy: [],
              contexts: [],
            },
          },
        },
        {
          entityType: 'mindEdge',
          recordId: 'todo-supports-goal',
          updatedAt: '2026-08-02T01:00:00.000Z',
          deleted: false,
          payload: {
            id: 'todo-supports-goal',
            source: { entityType: 'todo', entityId: 'todo-controls' },
            target: { entityType: 'mindNode', entityId: 'goal-robotics' },
            relationshipType: 'supports goal',
            archived: false,
          },
        },
      ],
      '2026-08-02T03:00:00.000Z',
    );
    const context = createAssistantContext(archive);
    expect(context.source).toEqual({
      forgeArchiveVersion: 1,
      username: 'josiahv',
      authoritativeFile: 'Forge Archive.json',
      derived: true,
    });
    expect(context.activeGoals).toEqual([
      expect.objectContaining({ id: 'goal-robotics', title: 'Build robotics systems' }),
    ]);
    expect(context.activeTodos).toEqual([
      expect.objectContaining({ title: 'External review' }),
      expect.objectContaining({ title: 'Study feedback control', estimatedMinutes: 45 }),
    ]);
    expect(context.actionableNow[0]).toEqual(
      expect.objectContaining({ title: 'Study feedback control', score: expect.any(Number) }),
    );
    expect(context.waitingItems).toEqual([expect.objectContaining({ title: 'External review' })]);
    expect(context.upcomingDeadlines[0]).toEqual(
      expect.objectContaining({ title: 'Study feedback control', daysRemaining: 1 }),
    );
    expect(context.importantRelationships).toEqual([
      expect.objectContaining({ relationshipType: 'supports goal' }),
    ]);
    expect(JSON.stringify(context)).not.toContain('Old goal');
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
      'Do not ask for redundant confirmation',
    );
    expect(readFileSync(join(directory, 'CHATGPT-FORGE-INSTRUCTIONS.md'), 'utf8')).toContain(
      'Never invent identity, values, beliefs',
    );
    expect(readFileSync(join(directory, 'CHATGPT-FORGE-INSTRUCTIONS.md'), 'utf8')).toContain(
      'Forge what we learned',
    );
    expect(existsSync(join(directory, 'Forge Mind Inbox Example.json'))).toBe(true);
    expect(existsSync(join(directory, 'Forge Execution Inbox Example.json'))).toBe(true);
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
            execution: {
              workState: 'waiting',
              waitingOn: 'Training date',
              waitingCondition: 'The scheduled training starts.',
              blockedBy: [],
              contexts: ['workshop'],
            },
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
            relationshipType: 'has skill',
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
    expect(
      JSON.parse(readFileSync(join(directory, 'Forge Assistant Context.json'), 'utf8'))
        .forgeAssistantContextVersion,
    ).toBe(1);
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
    expect(
      (
        store.archiveRecord(account.id, 'todo', 'todo-practice')?.payload?.execution as {
          workState: string;
        }
      ).workState,
    ).toBe('waiting');
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
