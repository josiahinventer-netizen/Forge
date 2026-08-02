import { afterEach, describe, expect, it } from 'vitest';
import { ForgeDatabase, SCHEMA_VERSION } from '../database/db';
import { createExport } from '../services/dataTransfer';

const databases: ForgeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe('JSON export', () => {
  it('exports metadata plus all active and archived records', async () => {
    const database = new ForgeDatabase(`forge-export-${crypto.randomUUID()}`);
    databases.push(database);
    await database.skills.bulkPut([
      {
        id: 'active',
        name: 'Active skill',
        description: '',
        category: 'General',
        knowledgeLevel: 1,
        practicalLevel: 0,
        confidence: 50,
        evidenceNotes: '',
        evidenceLinks: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        tags: [],
        archived: false,
      },
      {
        id: 'archived',
        name: 'Archived skill',
        description: '',
        category: 'General',
        knowledgeLevel: 1,
        practicalLevel: 0,
        confidence: 50,
        evidenceNotes: '',
        evidenceLinks: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        tags: [],
        archived: true,
      },
    ]);
    await database.capabilities.put({
      id: 'capability',
      name: 'Build a workbench',
      description: '',
      category: 'Construction',
      requiredSkills: [{ skillId: 'active', minimumKnowledgeLevel: 1, minimumPracticalLevel: 0 }],
      requiredResources: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      tags: [],
      archived: false,
    });

    const bundle = await createExport(database);
    const parsed = JSON.parse(JSON.stringify(bundle)) as typeof bundle;

    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.appVersion).toBe('1.0.0');
    expect(Number.isNaN(Date.parse(parsed.exportDate))).toBe(false);
    expect(parsed.records.skills.map((skill) => skill.id)).toEqual(['active', 'archived']);
    expect(parsed.records.resources).toEqual([]);
    expect(parsed.records.capabilities).toHaveLength(1);
    expect(parsed.records.capabilities[0]?.requiredSkills[0]?.skillId).toBe('active');
  });
});
