import { afterEach, describe, expect, it } from 'vitest';
import { ForgeDatabase, SCHEMA_VERSION } from '../database/db';
import { importData, validateImport } from '../services/dataTransfer';
import type { ExportBundle, Skill } from '../types/models';

const databases: ForgeDatabase[] = [];
const skill = (id: string, name: string, updatedAt: string): Skill => ({
  id,
  name,
  description: '',
  category: 'General',
  knowledgeLevel: 1,
  practicalLevel: 0,
  confidence: 50,
  evidenceNotes: '',
  evidenceLinks: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
  tags: [],
  archived: false,
});
const bundle = (skills: Skill[]): ExportBundle => ({
  exportDate: '2026-08-02T00:00:00.000Z',
  appVersion: '1.0.0',
  schemaVersion: SCHEMA_VERSION,
  records: { skills, resources: [], capabilities: [] },
});

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe('import validation', () => {
  it('accepts a complete current Forge backup', () => {
    const result = validateImport(bundle([skill('one', 'Carpentry', '2026-08-01T00:00:00.000Z')]));
    expect(result.valid).toBe(true);
  });

  it('accepts bounded photo evidence attached to an activity', () => {
    const backup = bundle([]);
    backup.records.attachments = [
      {
        id: 'activity-photo',
        ownerType: 'activity',
        ownerId: 'activity-1',
        kind: 'Project result',
        fileName: 'result.jpg',
        mimeType: 'image/jpeg',
        byteSize: 3,
        width: 1,
        height: 1,
        sha256: 'd'.repeat(64),
        dataUrl: 'data:image/jpeg;base64,YWJj',
        verificationStatus: 'Activity-supported',
        notes: 'Finished repair',
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
        tags: [],
        archived: false,
      },
    ];
    expect(validateImport(backup).valid).toBe(true);
  });

  it('rejects malformed records, duplicate IDs, and future schemas', () => {
    const malformed = validateImport({
      ...bundle([]),
      records: { skills: [{ id: 'broken' }], resources: [], capabilities: [] },
    });
    const duplicate = validateImport(
      bundle([
        skill('same', 'First', '2026-08-01T00:00:00.000Z'),
        skill('same', 'Second', '2026-08-02T00:00:00.000Z'),
      ]),
    );
    const future = validateImport({ ...bundle([]), schemaVersion: SCHEMA_VERSION + 1 });

    expect(malformed).toEqual({ valid: false, errors: ['Skills contain invalid data.'] });
    expect(duplicate).toEqual({ valid: false, errors: ['Skills contain duplicate IDs.'] });
    expect(future).toEqual({
      valid: false,
      errors: [`Schema version must be between 1 and ${SCHEMA_VERSION}.`],
    });
  });
});

describe('import application', () => {
  it('merges by stable ID without duplicates and preserves the newest record', async () => {
    const database = new ForgeDatabase(`forge-merge-${crypto.randomUUID()}`);
    databases.push(database);
    await database.skills.bulkPut([
      skill('shared', 'New local name', '2026-08-03T00:00:00.000Z'),
      skill('local', 'Local only', '2026-08-01T00:00:00.000Z'),
    ]);

    await importData(
      bundle([
        skill('shared', 'Older imported name', '2026-08-02T00:00:00.000Z'),
        skill('incoming', 'Imported', '2026-08-02T00:00:00.000Z'),
      ]),
      'merge',
      database,
    );

    expect(await database.skills.count()).toBe(3);
    expect((await database.skills.get('shared'))?.name).toBe('New local name');
    expect((await database.skills.get('incoming'))?.name).toBe('Imported');
  });

  it('replaces all local record types only when replace mode is requested', async () => {
    const database = new ForgeDatabase(`forge-replace-${crypto.randomUUID()}`);
    databases.push(database);
    await database.skills.put(skill('local', 'Local', '2026-08-01T00:00:00.000Z'));
    await database.resources.put({
      id: 'old-resource',
      name: 'Old resource',
      description: '',
      category: 'General',
      resourceType: 'Tool',
      quantity: 1,
      unit: 'item',
      condition: 'Good',
      location: '',
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      tags: [],
      archived: false,
    });

    await importData(
      bundle([skill('incoming', 'Replacement', '2026-08-02T00:00:00.000Z')]),
      'replace',
      database,
    );

    expect((await database.skills.toArray()).map((record) => record.id)).toEqual(['incoming']);
    expect(await database.resources.count()).toBe(0);
    expect(await database.capabilities.count()).toBe(0);
    expect(await database.todos.count()).toBe(0);
  });
});
