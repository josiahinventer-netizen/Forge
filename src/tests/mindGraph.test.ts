import { describe, expect, it } from 'vitest';
import {
  connectedMindEdges,
  mindEdgeIntegrityIssues,
  resolveEntityReference,
} from '../services/mindGraph';
import type { GraphEntityCollections } from '../services/mindGraph';
import type { MindEdge, MindNode, Skill } from '../types/models';

const base = {
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  tags: [] as string[],
  archived: false,
};
const node = (id: string, title: string): MindNode => ({
  ...base,
  id,
  title,
  type: 'concept',
  description: '',
  notes: '',
  status: 'developing',
  confidence: 50,
  importance: 50,
});
const skill: Skill = {
  ...base,
  id: 'troubleshooting',
  name: 'Troubleshooting',
  description: '',
  category: 'General',
  knowledgeLevel: 2,
  practicalLevel: 2,
  confidence: 60,
  evidenceNotes: '',
  evidenceLinks: [],
};
const collections: GraphEntityCollections = {
  mindNodes: [node('engineering', 'Engineering'), node('robotics', 'Robotics')],
  skills: [skill],
  resources: [],
  capabilities: [],
  todos: [],
  activities: [],
};
const edge = (overrides: Partial<MindEdge> = {}): MindEdge => ({
  ...base,
  id: 'edge-1',
  source: { entityType: 'mindNode', entityId: 'robotics' },
  target: { entityType: 'skill', entityId: 'troubleshooting' },
  relationshipType: 'requires',
  notes: '',
  ...overrides,
});

describe('mind graph integrity', () => {
  it('resolves both native nodes and existing Forge records without duplication', () => {
    expect(
      resolveEntityReference({ entityType: 'mindNode', entityId: 'engineering' }, collections)
        ?.label,
    ).toBe('Engineering');
    expect(
      resolveEntityReference({ entityType: 'skill', entityId: 'troubleshooting' }, collections)
        ?.label,
    ).toBe('Troubleshooting');
  });

  it('accepts a valid cross-entity relationship and finds it from the focused node', () => {
    const relationship = edge();
    expect(mindEdgeIntegrityIssues(relationship, collections)).toEqual([]);
    expect(
      connectedMindEdges(
        { entityType: 'mindNode', entityId: 'robotics' },
        [relationship],
        collections,
      ),
    ).toHaveLength(1);
  });

  it('reports missing, archived, self, custom-label, and duplicate integrity failures', () => {
    const archivedCollections = {
      ...collections,
      mindNodes: [
        node('engineering', 'Engineering'),
        { ...node('robotics', 'Robotics'), archived: true },
      ],
    };
    expect(mindEdgeIntegrityIssues(edge(), archivedCollections)).toContain(
      'The source record is archived.',
    );
    expect(
      mindEdgeIntegrityIssues(
        edge({ target: { entityType: 'mindNode', entityId: 'missing' } }),
        collections,
      ),
    ).toContain('The target record does not exist.');
    expect(
      mindEdgeIntegrityIssues(
        edge({ target: { entityType: 'mindNode', entityId: 'robotics' } }),
        collections,
      ),
    ).toContain('A relationship must connect two different records.');
    expect(
      mindEdgeIntegrityIssues(
        edge({ relationshipType: 'custom', customRelationship: '' }),
        collections,
      ),
    ).toContain('A custom relationship needs a label.');
    expect(
      mindEdgeIntegrityIssues(
        edge({
          source: { entityType: 'skill', entityId: 'troubleshooting' },
          target: { entityType: 'skill', entityId: 'troubleshooting' },
        }),
        collections,
      ),
    ).toContain('At least one side of a mind relationship must be a mind node.');
    expect(mindEdgeIntegrityIssues(edge({ id: 'edge-2' }), collections, [edge()])).toContain(
      'This relationship already exists.',
    );
  });

  it('hides archived relationships without deleting their records', () => {
    expect(
      connectedMindEdges(
        { entityType: 'mindNode', entityId: 'robotics' },
        [edge({ archived: true })],
        collections,
      ),
    ).toEqual([]);
  });
});
