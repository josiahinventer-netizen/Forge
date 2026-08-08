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
    await database.attachments.put({
      id: 'evidence',
      ownerType: 'skill',
      ownerId: 'active',
      kind: 'Project result',
      fileName: 'evidence.jpg',
      mimeType: 'image/jpeg',
      byteSize: 3,
      width: 1,
      height: 1,
      sha256: 'c'.repeat(64),
      dataUrl: 'data:image/jpeg;base64,YWJj',
      verificationStatus: 'Confirmed',
      notes: '',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      tags: [],
      archived: false,
    });
    await database.documentEvidence.put({
      id: 'document-evidence',
      ownerType: 'skill',
      ownerId: 'active',
      title: 'Resume project entry',
      sourceType: 'Resume',
      sourceName: 'Josiah resume',
      excerpt: 'Designed and built a documented project.',
      notes: '',
      verificationStatus: 'Document-supported',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      tags: [],
      archived: false,
    });
    await database.mindNodes.put({
      id: 'mechanical-engineering',
      title: 'Mechanical engineering',
      type: 'knowledge',
      description: 'Engineering knowledge branch.',
      notes: '',
      status: 'developing',
      confidence: 70,
      importance: 90,
      familiarityLevel: 3,
      practicalLevel: 2,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      tags: ['engineering'],
      archived: false,
    });
    await database.mindEdges.put({
      id: 'engineering-carpentry',
      source: { entityType: 'mindNode', entityId: 'mechanical-engineering' },
      target: { entityType: 'skill', entityId: 'active' },
      relationshipType: 'related to',
      notes: 'Existing skill participates without being copied.',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      tags: [],
      archived: false,
    });
    await database.todos.put({
      id: 'todo',
      title: 'Build practice joint',
      description: '',
      purpose: 'Practice carpentry',
      status: 'Open',
      priority: 'Normal',
      linkedSkillIds: ['active'],
      linkedResourceIds: [],
      linkedCapabilityIds: [],
      completionNotes: '',
      checklist: [{ id: 'measure', text: 'Measure boards', completed: false }],
      execution: {
        workState: 'blocked',
        blockedReason: 'Waiting for the active skill prerequisite',
        blockedBy: [{ entityType: 'skill', entityId: 'active' }],
        contexts: ['workshop'],
      },
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      tags: [],
      archived: false,
    });
    await database.activities.put({
      id: 'activity',
      title: 'Practice joint',
      description: '',
      purpose: 'Improve carpentry',
      occurredAt: '2026-01-02',
      durationMinutes: 45,
      outcome: 'Completed joint',
      reflection: '',
      skillPractice: [
        {
          skillId: 'active',
          kind: 'Independent application',
          minutes: 45,
          verificationStatus: 'Activity-supported',
          notes: '',
        },
      ],
      linkedResourceIds: [],
      linkedCapabilityIds: ['capability'],
      linkedTodoIds: ['todo'],
      createdAt: '2026-01-02',
      updatedAt: '2026-01-02',
      tags: [],
      archived: false,
    });
    await database.todoOccurrences.put({
      id: 'occurrence',
      todoId: 'todo',
      title: 'Build practice joint',
      purpose: 'Practice carpentry',
      completedAt: '2026-01-03',
      completionNotes: 'Done',
      checklist: [
        {
          id: 'measure',
          text: 'Measure boards',
          completed: true,
          completedAt: '2026-01-03',
        },
      ],
      createdAt: '2026-01-03',
      updatedAt: '2026-01-03',
      tags: [],
      archived: false,
    });
    await database.reminderEvents.put({
      id: 'reminder',
      todoId: 'todo',
      occurrenceKey: 'todo:2026-01-02',
      title: 'Build practice joint',
      purpose: 'Practice carpentry',
      detectedAt: '2026-01-02',
      acknowledgedAt: '2026-01-02',
      action: 'Completed',
      createdAt: '2026-01-02',
      updatedAt: '2026-01-02',
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
    expect(parsed.records.attachments?.[0]?.ownerId).toBe('active');
    expect(parsed.records.documentEvidence?.[0]?.sourceName).toBe('Josiah resume');
    expect(parsed.records.mindNodes?.[0]?.title).toBe('Mechanical engineering');
    expect(parsed.records.mindEdges?.[0]?.target).toEqual({
      entityType: 'skill',
      entityId: 'active',
    });
    expect(parsed.records.todos?.[0]?.purpose).toBe('Practice carpentry');
    expect(parsed.records.todos?.[0]?.checklist?.[0]?.text).toBe('Measure boards');
    expect(parsed.records.todos?.[0]?.execution?.blockedBy[0]).toEqual({
      entityType: 'skill',
      entityId: 'active',
    });
    expect(parsed.records.activities?.[0]?.skillPractice[0]?.skillId).toBe('active');
    expect(parsed.records.todoOccurrences?.[0]?.todoId).toBe('todo');
    expect(parsed.records.todoOccurrences?.[0]?.checklist?.[0]?.completed).toBe(true);
    expect(parsed.records.reminderEvents?.[0]?.action).toBe('Completed');
  });
});
