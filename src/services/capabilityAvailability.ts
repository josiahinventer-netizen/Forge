import type { Capability, CapabilityAvailability, Level, Resource, Skill } from '../types/models';

export type MissingCapabilityRequirement =
  | {
      type: 'skill-unavailable';
      skillId: string;
      skillName: string;
      reason: 'missing' | 'archived';
    }
  | {
      type: 'skill-level';
      skillId: string;
      skillName: string;
      levelType: 'knowledge' | 'practical';
      currentLevel: Level;
      requiredLevel: Level;
    }
  | {
      type: 'resource-unavailable';
      resourceId: string;
      resourceName: string;
      reason: 'missing' | 'archived';
      requiredQuantity: number;
      unit: string;
    }
  | {
      type: 'resource-quantity';
      resourceId: string;
      resourceName: string;
      currentQuantity: number;
      requiredQuantity: number;
      missingQuantity: number;
      unit: string;
    };

export interface CapabilityAssessment {
  status: CapabilityAvailability;
  missing: MissingCapabilityRequirement[];
  missingExplanations: string[];
  metRequirementCount: number;
  totalRequirementCount: number;
  recommendedStep: string | null;
}

const unavailableName = (kind: 'skill' | 'resource', id: string) =>
  `${kind === 'skill' ? 'Skill' : 'Resource'} ${id}`;

export function explainMissingRequirement(requirement: MissingCapabilityRequirement): string {
  switch (requirement.type) {
    case 'skill-unavailable':
      return requirement.reason === 'archived'
        ? `${requirement.skillName} is archived and cannot satisfy this capability.`
        : `${requirement.skillName} has not been added to Skills.`;
    case 'skill-level':
      return `${requirement.skillName} ${requirement.levelType} level is ${requirement.currentLevel}; level ${requirement.requiredLevel} is required.`;
    case 'resource-unavailable':
      return requirement.reason === 'archived'
        ? `${requirement.resourceName} is archived; ${requirement.requiredQuantity} ${requirement.unit} is required.`
        : `${requirement.resourceName} has not been added to Resources; ${requirement.requiredQuantity} ${requirement.unit} is required.`;
    case 'resource-quantity':
      return `${requirement.resourceName} is short by ${requirement.missingQuantity} ${requirement.unit} (${requirement.currentQuantity} available; ${requirement.requiredQuantity} required).`;
  }
}

function recommendationFor(requirement: MissingCapabilityRequirement): string {
  switch (requirement.type) {
    case 'skill-unavailable':
      return requirement.reason === 'archived'
        ? `Restore ${requirement.skillName} or replace it with an active skill requirement.`
        : `Add ${requirement.skillName} to Skills or replace the missing reference.`;
    case 'skill-level':
      return `Raise ${requirement.skillName} ${requirement.levelType} from level ${requirement.currentLevel} to ${requirement.requiredLevel}.`;
    case 'resource-unavailable':
      return requirement.reason === 'archived'
        ? `Restore ${requirement.resourceName} or replace it with an active resource requirement.`
        : `Add ${requirement.requiredQuantity} ${requirement.unit} of ${requirement.resourceName} to Resources.`;
    case 'resource-quantity':
      return `Acquire ${requirement.missingQuantity} more ${requirement.unit} of ${requirement.resourceName}.`;
  }
}

export function assessCapability(
  capability: Capability,
  skills: readonly Skill[],
  resources: readonly Resource[],
): CapabilityAssessment {
  const missing: MissingCapabilityRequirement[] = [];
  let metRequirementCount = 0;
  let partiallyMet = false;

  for (const requirement of capability.requiredSkills) {
    const skill = skills.find((candidate) => candidate.id === requirement.skillId);
    if (!skill) {
      missing.push({
        type: 'skill-unavailable',
        skillId: requirement.skillId,
        skillName: unavailableName('skill', requirement.skillId),
        reason: 'missing',
      });
      continue;
    }
    if (skill.archived) {
      missing.push({
        type: 'skill-unavailable',
        skillId: skill.id,
        skillName: skill.name,
        reason: 'archived',
      });
      continue;
    }

    const knowledgeMet = skill.knowledgeLevel >= requirement.minimumKnowledgeLevel;
    const practicalMet = skill.practicalLevel >= requirement.minimumPracticalLevel;
    if (!knowledgeMet) {
      missing.push({
        type: 'skill-level',
        skillId: skill.id,
        skillName: skill.name,
        levelType: 'knowledge',
        currentLevel: skill.knowledgeLevel,
        requiredLevel: requirement.minimumKnowledgeLevel,
      });
    }
    if (!practicalMet) {
      missing.push({
        type: 'skill-level',
        skillId: skill.id,
        skillName: skill.name,
        levelType: 'practical',
        currentLevel: skill.practicalLevel,
        requiredLevel: requirement.minimumPracticalLevel,
      });
    }
    if (knowledgeMet && practicalMet) metRequirementCount += 1;
    else if (knowledgeMet || practicalMet) partiallyMet = true;
  }

  for (const requirement of capability.requiredResources) {
    const resource = resources.find((candidate) => candidate.id === requirement.resourceId);
    if (!resource) {
      missing.push({
        type: 'resource-unavailable',
        resourceId: requirement.resourceId,
        resourceName: unavailableName('resource', requirement.resourceId),
        reason: 'missing',
        requiredQuantity: requirement.requiredQuantity,
        unit: requirement.unit,
      });
      continue;
    }
    if (resource.archived) {
      missing.push({
        type: 'resource-unavailable',
        resourceId: resource.id,
        resourceName: resource.name,
        reason: 'archived',
        requiredQuantity: requirement.requiredQuantity,
        unit: requirement.unit,
      });
      continue;
    }
    if (resource.quantity < requirement.requiredQuantity) {
      missing.push({
        type: 'resource-quantity',
        resourceId: resource.id,
        resourceName: resource.name,
        currentQuantity: resource.quantity,
        requiredQuantity: requirement.requiredQuantity,
        missingQuantity: requirement.requiredQuantity - resource.quantity,
        unit: requirement.unit,
      });
      if (resource.quantity > 0) partiallyMet = true;
    } else {
      metRequirementCount += 1;
    }
  }

  const totalRequirementCount =
    capability.requiredSkills.length + capability.requiredResources.length;
  const status: CapabilityAvailability =
    missing.length === 0
      ? 'Available'
      : metRequirementCount > 0 || partiallyMet
        ? 'Partially available'
        : 'Blocked';

  return {
    status,
    missing,
    missingExplanations: missing.map(explainMissingRequirement),
    metRequirementCount,
    totalRequirementCount,
    recommendedStep: missing[0] ? recommendationFor(missing[0]) : null,
  };
}
