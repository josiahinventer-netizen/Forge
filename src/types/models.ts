export type Level = 0 | 1 | 2 | 3 | 4 | 5;

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  archived: boolean;
}

export interface Skill extends BaseRecord {
  name: string;
  description: string;
  category: string;
  knowledgeLevel: Level;
  practicalLevel: Level;
  confidence: number;
  evidenceNotes: string;
  evidenceLinks: string[];
  lastUsedAt?: string;
}

export interface Resource extends BaseRecord {
  name: string;
  description: string;
  category: string;
  resourceType: string;
  quantity: number;
  unit: string;
  condition: string;
  location: string;
  notes: string;
}

export interface CapabilitySkillRequirement {
  skillId: string;
  minimumKnowledgeLevel: Level;
  minimumPracticalLevel: Level;
}

export interface CapabilityResourceRequirement {
  resourceId: string;
  requiredQuantity: number;
  unit: string;
}

export interface Capability extends BaseRecord {
  name: string;
  description: string;
  category: string;
  requiredSkills: CapabilitySkillRequirement[];
  requiredResources: CapabilityResourceRequirement[];
}

export interface SyncSettings {
  id: 'primary';
  serverUrl: string;
  username: string;
  sessionToken: string;
  sessionExpiresAt: string;
  cursor: number;
  lastSyncAt?: string;
  lastError?: string;
}

export type CapabilityAvailability = 'Available' | 'Partially available' | 'Blocked';

export interface ExportBundle {
  exportDate: string;
  appVersion: string;
  schemaVersion: number;
  records: {
    skills: Skill[];
    resources: Resource[];
    capabilities: Capability[];
  };
}

export const LEVEL_LABELS = [
  'Unknown',
  'Awareness',
  'Basic understanding',
  'Working understanding',
  'Demonstrated application',
  'Can troubleshoot, design, or teach',
] as const;

export const RESOURCE_TYPES = [
  'Tool',
  'Material',
  'Equipment',
  'Property',
  'Vehicle',
  'Software',
  'Document',
  'Money',
  'Workspace',
  'Energy source',
  'Food',
  'Water',
  'Other',
] as const;
