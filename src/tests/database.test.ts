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
      'attachments',
      'capabilities',
      'resources',
      'skills',
      'syncSettings',
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
      'attachments',
      'capabilities',
      'resources',
      'skills',
      'syncSettings',
      'todos',
    ]);
    expect(await migrated.capabilities.count()).toBe(0);
    expect(await migrated.attachments.count()).toBe(0);
    expect(await migrated.todos.count()).toBe(0);
  });
});
