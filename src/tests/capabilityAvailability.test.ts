import { describe, expect, it } from 'vitest';
import { assessCapability } from '../services/capabilityAvailability';
import type { Capability, Resource, Skill } from '../types/models';

const base = {
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  tags: [] as string[],
  archived: false,
};
const skill: Skill = {
  ...base,
  id: 'carpentry',
  name: 'Carpentry',
  description: '',
  category: 'Construction',
  knowledgeLevel: 3,
  practicalLevel: 3,
  confidence: 70,
  evidenceNotes: '',
  evidenceLinks: [],
};
const resource: Resource = {
  ...base,
  id: 'plywood',
  name: 'Plywood',
  description: '',
  category: 'Material',
  resourceType: 'Material',
  quantity: 1,
  unit: 'sheet',
  condition: 'Good',
  location: 'Shop',
  notes: '',
};
const capability: Capability = {
  ...base,
  id: 'workbench',
  name: 'Build a plywood workbench',
  description: '',
  category: 'Construction',
  requiredSkills: [{ skillId: skill.id, minimumKnowledgeLevel: 2, minimumPracticalLevel: 3 }],
  requiredResources: [{ resourceId: resource.id, requiredQuantity: 1, unit: 'sheet' }],
};

describe('capability availability', () => {
  it('reports Available for exact skill levels and resource quantities', () => {
    const exactSkill = { ...skill, knowledgeLevel: 2 as const };
    const result = assessCapability(capability, [exactSkill], [resource]);

    expect(result.status).toBe('Available');
    expect(result.missing).toEqual([]);
    expect(result.metRequirementCount).toBe(2);
    expect(result.recommendedStep).toBeNull();
  });

  it('returns structured shortfalls for insufficient skill levels', () => {
    const result = assessCapability(capability, [{ ...skill, practicalLevel: 1 }], [resource]);

    expect(result.status).toBe('Partially available');
    expect(result.missing).toContainEqual({
      type: 'skill-level',
      skillId: 'carpentry',
      skillName: 'Carpentry',
      levelType: 'practical',
      currentLevel: 1,
      requiredLevel: 3,
    });
    expect(result.missingExplanations).toContain(
      'Carpentry practical level is 1; level 3 is required.',
    );
  });

  it('reports a missing resource reference in plain language', () => {
    const result = assessCapability(capability, [skill], []);

    expect(result.status).toBe('Partially available');
    expect(result.missing[0]).toMatchObject({
      type: 'resource-unavailable',
      resourceId: 'plywood',
      reason: 'missing',
    });
    expect(result.missingExplanations[0]).toContain('has not been added to Resources');
  });

  it('calculates insufficient resource quantities and a useful next step', () => {
    const twelveBoardsCapability: Capability = {
      ...capability,
      requiredSkills: [],
      requiredResources: [{ resourceId: resource.id, requiredQuantity: 12, unit: 'boards' }],
    };
    const result = assessCapability(
      twelveBoardsCapability,
      [],
      [{ ...resource, quantity: 4, unit: 'boards' }],
    );

    expect(result.status).toBe('Partially available');
    expect(result.missing).toEqual([
      {
        type: 'resource-quantity',
        resourceId: 'plywood',
        resourceName: 'Plywood',
        currentQuantity: 4,
        requiredQuantity: 12,
        missingQuantity: 8,
        unit: 'boards',
      },
    ]);
    expect(result.recommendedStep).toBe('Acquire 8 more boards of Plywood.');
  });

  it('treats archived skills and resources as unavailable requirements', () => {
    const result = assessCapability(
      capability,
      [{ ...skill, archived: true }],
      [{ ...resource, archived: true }],
    );

    expect(result.status).toBe('Blocked');
    expect(result.missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'skill-unavailable', reason: 'archived' }),
        expect.objectContaining({ type: 'resource-unavailable', reason: 'archived' }),
      ]),
    );
  });

  it('recalculates from changed source records without mutating the capability', () => {
    const first = assessCapability(
      capability,
      [{ ...skill, practicalLevel: 1 }],
      [{ ...resource, quantity: 0 }],
    );
    const second = assessCapability(capability, [skill], [resource]);

    expect(first.status).toBe('Partially available');
    expect(first.missing).toHaveLength(2);
    expect(second.status).toBe('Available');
    expect(second.missing).toEqual([]);
    expect(capability).toEqual({
      ...base,
      id: 'workbench',
      name: 'Build a plywood workbench',
      description: '',
      category: 'Construction',
      requiredSkills: [
        { skillId: 'carpentry', minimumKnowledgeLevel: 2, minimumPracticalLevel: 3 },
      ],
      requiredResources: [{ resourceId: 'plywood', requiredQuantity: 1, unit: 'sheet' }],
    });
  });
});
