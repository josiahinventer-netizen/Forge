import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { ForgeDatabase, SCHEMA_VERSION } from '../database/db';
import type { Capability, Resource, Skill } from '../types/models';

const databases: ForgeDatabase[] = [];
const makeDatabase = () => {
  const database = new ForgeDatabase(`forge-test-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
};

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe('ForgeDatabase', () => {
  it('creates the versioned skills and resources schema', async () => {
    const database = makeDatabase();
    await database.open();

    expect(database.verno).toBe(SCHEMA_VERSION);
    expect(database.tables.map((table) => table.name).sort()).toEqual([
      'activities',
      'attachments',
      'capabilities',
      'documentEvidence',
      'mindEdges',
      'mindNodes',
      'reminderEvents',
      'resources',
      'skills',
      'syncSettings',
      'todoOccurrences',
      'todos',
    ]);
  });

  it('persists, updates, searches, and archives skill and resource records', async () => {
    const database = makeDatabase();
    const skill: Skill = {
      id: 'skill-1',
      name: 'Basic carpentry',
      description: 'Measure, cut, and assemble wood.',
      category: 'Construction',
      knowledgeLevel: 2,
      practicalLevel: 1,
      confidence: 60,
      evidenceNotes: '',
      evidenceLinks: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: ['wood'],
      archived: false,
    };
    const resource: Resource = {
      id: 'resource-1',
      name: 'Claw hammer',
      description: '',
      category: 'Hand tools',
      resourceType: 'Tool',
      quantity: 1,
      unit: 'item',
      condition: 'Good',
      location: 'Garage',
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      archived: false,
    };

    await database.skills.put(skill);
    await database.resources.put(resource);
    await database.attachments.put({
      id: 'attachment-1',
      ownerType: 'resource',
      ownerId: resource.id,
      kind: 'Serial label',
      fileName: 'serial.jpg',
      mimeType: 'image/jpeg',
      byteSize: 3,
      width: 1,
      height: 1,
      sha256: 'a'.repeat(64),
      dataUrl: 'data:image/jpeg;base64,YWJj',
      verificationStatus: 'Confirmed',
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      archived: false,
    });
    await database.skills.update(skill.id, { knowledgeLevel: 3, archived: true });

    expect((await database.skills.get(skill.id))?.knowledgeLevel).toBe(3);
    expect(await database.skills.filter((item) => item.name.includes('carpentry')).count()).toBe(1);
    expect((await database.skills.get(skill.id))?.archived).toBe(true);
    expect((await database.resources.get(resource.id))?.location).toBe('Garage');
    expect((await database.attachments.where('ownerId').equals(resource.id).first())?.kind).toBe(
      'Serial label',
    );
    await database.attachments.put({
      id: 'activity-photo',
      ownerType: 'activity',
      ownerId: 'activity-1',
      kind: 'Project result',
      fileName: 'result.jpg',
      mimeType: 'image/jpeg',
      byteSize: 3,
      width: 1,
      height: 1,
      sha256: 'b'.repeat(64),
      dataUrl: 'data:image/jpeg;base64,YWJj',
      verificationStatus: 'Activity-supported',
      notes: 'Observed result',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      tags: [],
      archived: false,
    });
    expect((await database.attachments.get('activity-photo'))?.ownerType).toBe('activity');
    await database.documentEvidence.put({
      id: 'course-evidence',
      ownerType: 'skill',
      ownerId: skill.id,
      title: 'Machine Design course',
      sourceType: 'Course or transcript',
      sourceName: 'Oregon Tech',
      excerpt: 'Completed machine design coursework.',
      notes: 'Supports knowledge, not independent practical proficiency.',
      verificationStatus: 'Document-supported',
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      tags: [],
      archived: false,
    });
    expect(
      (await database.documentEvidence.where('ownerId').equals(skill.id).first())?.sourceName,
    ).toBe('Oregon Tech');
  });

  it('persists, searches, updates, and archives capability references', async () => {
    const database = makeDatabase();
    const capability: Capability = {
      id: 'capability-1',
      name: 'Change a vehicle tire',
      description: 'Safely replace a flat tire with a usable spare.',
      category: 'Mechanical',
      requiredSkills: [
        {
          skillId: 'vehicle-maintenance',
          minimumKnowledgeLevel: 1,
          minimumPracticalLevel: 2,
        },
      ],
      requiredResources: [
        { resourceId: 'jack', requiredQuantity: 1, unit: 'item' },
        { resourceId: 'lug-wrench', requiredQuantity: 1, unit: 'item' },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: ['vehicle'],
      archived: false,
    };

    await database.capabilities.put(capability);
    const searchResults = await database.capabilities
      .filter((item) => item.name.toLowerCase().includes('vehicle tire'))
      .toArray();
    await database.capabilities.update(capability.id, {
      description: 'Updated instructions.',
      archived: true,
    });
    const stored = await database.capabilities.get(capability.id);

    expect(searchResults.map((item) => item.id)).toEqual(['capability-1']);
    expect(stored?.requiredSkills[0]?.skillId).toBe('vehicle-maintenance');
    expect(stored?.requiredResources.map((requirement) => requirement.resourceId)).toEqual([
      'jack',
      'lug-wrench',
    ]);
    expect(stored?.description).toBe('Updated instructions.');
    expect(stored?.archived).toBe(true);
  });

  it('migrates legacy records and creates the capabilities table without losing data', async () => {
    const name = `forge-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      skills: 'id, name, category, archived, updatedAt',
      resources: 'id, name, category, resourceType, archived, updatedAt',
      capabilities: 'id',
      actions: 'id',
      knowledgeEntries: 'id',
      profiles: 'id',
    });
    await legacy.table('skills').put({
      id: 'legacy-skill',
      name: 'Legacy skill',
      description: '',
      category: 'General',
      knowledgeLevel: 1,
      practicalLevel: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });
    await legacy.table('resources').put({
      id: 'legacy-resource',
      name: 'Legacy tool',
      description: '',
      category: 'Tools',
      resourceType: 'Tool',
      quantity: 1,
      unit: 'item',
      condition: 'Good',
      location: '',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });
    legacy.close();

    const migrated = new ForgeDatabase(name);
    databases.push(migrated);
    await migrated.open();
    const skill = await migrated.skills.get('legacy-skill');

    expect(skill?.tags).toEqual([]);
    expect(skill?.archived).toBe(false);
    expect(skill?.confidence).toBe(50);
    const resource = await migrated.resources.get('legacy-resource');
    expect(resource?.name).toBe('Legacy tool');
    expect(resource?.resourceClass).toBe('Durable asset');
    expect(resource?.verificationStatus).toBe('Confirmed');
    expect(resource?.photoDataUrls).toEqual([]);
    expect(migrated.tables.map((table) => table.name).sort()).toEqual([
      'activities',
      'attachments',
      'capabilities',
      'documentEvidence',
      'mindEdges',
      'mindNodes',
      'reminderEvents',
      'resources',
      'skills',
      'syncSettings',
      'todoOccurrences',
      'todos',
    ]);
    expect(await migrated.capabilities.count()).toBe(0);
    expect(await migrated.attachments.count()).toBe(0);
    expect(await migrated.activities.count()).toBe(0);
    expect(await migrated.todos.count()).toBe(0);
    expect(await migrated.todoOccurrences.count()).toBe(0);
    expect(await migrated.reminderEvents.count()).toBe(0);
    expect(await migrated.documentEvidence.count()).toBe(0);
  });

  it('migrates schema 11 todos and occurrence history to empty checklists', async () => {
    const name = `forge-checklist-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(11).stores({
      todos: 'id, title, status, priority, scheduledFor, dueAt, archived, updatedAt, *tags',
      todoOccurrences: 'id, todoId, completedAt, archived, updatedAt, *tags',
    });
    await legacy.table('todos').put({
      id: 'legacy-todo',
      title: 'Legacy routine',
      status: 'Open',
      priority: 'Normal',
      archived: false,
      updatedAt: '2026-08-01T00:00:00.000Z',
      tags: [],
    });
    await legacy.table('todoOccurrences').put({
      id: 'legacy-occurrence',
      todoId: 'legacy-todo',
      completedAt: '2026-08-01T00:00:00.000Z',
      archived: false,
      updatedAt: '2026-08-01T00:00:00.000Z',
      tags: [],
    });
    legacy.close();

    const migrated = new ForgeDatabase(name);
    databases.push(migrated);
    await migrated.open();
    expect((await migrated.todos.get('legacy-todo'))?.checklist).toEqual([]);
    expect((await migrated.todoOccurrences.get('legacy-occurrence'))?.checklist).toEqual([]);
  });

  it('adds schema 13 document evidence without changing existing schema 12 records', async () => {
    const name = `forge-document-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(12).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      attachments: 'id, ownerType, ownerId, kind, verificationStatus, archived, updatedAt, sha256',
    });
    await legacy.table('skills').put({
      id: 'existing-skill',
      name: 'Mechanical engineering',
      category: 'Engineering',
      archived: false,
      updatedAt: '2026-08-01T00:00:00.000Z',
      tags: [],
    });
    legacy.close();

    const migrated = new ForgeDatabase(name);
    databases.push(migrated);
    await migrated.open();

    expect((await migrated.skills.get('existing-skill'))?.name).toBe('Mechanical engineering');
    expect(await migrated.documentEvidence.count()).toBe(0);
    expect(migrated.documentEvidence.schema.indexes.map((index) => index.name)).toContain(
      'ownerId',
    );
  });

  it('persists, edits, connects, searches, and archives mind graph records', async () => {
    const database = makeDatabase();
    await database.mindNodes.bulkPut([
      {
        id: 'engineering',
        title: 'Mechanical engineering',
        type: 'knowledge',
        description: 'A field of engineering.',
        notes: '',
        status: 'developing',
        confidence: 70,
        importance: 90,
        familiarityLevel: 3,
        practicalLevel: 2,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        tags: ['engineering'],
        archived: false,
      },
      {
        id: 'machine-design',
        title: 'Machine design',
        type: 'concept',
        description: '',
        notes: '',
        status: 'developing',
        confidence: 60,
        importance: 80,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        tags: [],
        archived: false,
      },
    ]);
    await database.mindEdges.put({
      id: 'engineering-machine-design',
      source: { entityType: 'mindNode', entityId: 'machine-design' },
      target: { entityType: 'mindNode', entityId: 'engineering' },
      relationshipType: 'part of',
      notes: '',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      tags: [],
      archived: false,
    });
    await database.mindNodes.update('machine-design', { confidence: 75 });
    await database.mindEdges.update('engineering-machine-design', {
      archived: true,
      updatedAt: '2026-08-02T00:00:00.000Z',
    });
    await database.mindNodes.update('engineering', {
      archived: true,
      updatedAt: '2026-08-02T00:00:00.000Z',
    });

    expect(
      await database.mindNodes.filter((node) => node.title.includes('engineering')).count(),
    ).toBe(1);
    expect((await database.mindNodes.get('machine-design'))?.confidence).toBe(75);
    expect((await database.mindEdges.get('engineering-machine-design'))?.archived).toBe(true);
    expect((await database.mindNodes.get('engineering'))?.archived).toBe(true);
  });

  it('adds schema 14 graph tables without changing schema 13 records', async () => {
    const name = `forge-mind-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(13).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      documentEvidence:
        'id, ownerType, ownerId, sourceType, verificationStatus, issuedAt, archived, updatedAt, *tags',
    });
    await legacy.table('skills').put({
      id: 'troubleshooting',
      name: 'Troubleshooting',
      category: 'General',
      archived: false,
      updatedAt: '2026-08-01T00:00:00.000Z',
      tags: [],
    });
    legacy.close();

    const migrated = new ForgeDatabase(name);
    databases.push(migrated);
    await migrated.open();

    expect((await migrated.skills.get('troubleshooting'))?.name).toBe('Troubleshooting');
    expect(await migrated.mindNodes.count()).toBe(0);
    expect(await migrated.mindEdges.count()).toBe(0);
  });

  it('adds schema 15 execution metadata to existing todos without changing their lifecycle', async () => {
    const name = `forge-execution-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(14).stores({
      todos: 'id, title, status, priority, scheduledFor, dueAt, archived, updatedAt, *tags',
    });
    await legacy.table('todos').put({
      id: 'existing-todo',
      title: 'Existing work',
      description: '',
      purpose: 'Keep it',
      status: 'Open',
      priority: 'Normal',
      linkedSkillIds: [],
      linkedResourceIds: [],
      linkedCapabilityIds: [],
      completionNotes: '',
      checklist: [],
      tags: [],
      archived: false,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    legacy.close();
    const migrated = new ForgeDatabase(name);
    databases.push(migrated);
    await migrated.open();
    const stored = await migrated.todos.get('existing-todo');
    expect(stored?.status).toBe('Open');
    expect(stored?.execution).toEqual({ workState: 'actionable', blockedBy: [], contexts: [] });
  });
});
