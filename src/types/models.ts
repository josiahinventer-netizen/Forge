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
  resourceClass?: ResourceClass;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  manufacturedAt?: string;
  acquiredAt?: string;
  expectedLifeMonths?: number;
  expiresAt?: string;
  maintenanceIntervalDays?: number;
  lastMaintainedAt?: string;
  replacementValue?: number;
  currency?: string;
  verificationStatus?: VerificationStatus;
  evidenceNotes?: string;
  photoDataUrls?: string[];
}

export type EvidenceOwnerType = 'resource' | 'skill' | 'capability';
export type EvidenceKind =
  'Item photo' | 'Serial label' | 'Receipt' | 'Condition' | 'Project result' | 'Other';

export interface EvidenceAttachment extends BaseRecord {
  ownerType: EvidenceOwnerType;
  ownerId: string;
  kind: EvidenceKind;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  dataUrl: string;
  verificationStatus: VerificationStatus;
  notes: string;
}

export type TodoStatus = 'Open' | 'In progress' | 'Completed';
export type TodoPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export interface Todo extends BaseRecord {
  title: string;
  description: string;
  purpose: string;
  status: TodoStatus;
  priority: TodoPriority;
  scheduledFor?: string;
  dueAt?: string;
  estimatedMinutes?: number;
  reminderMinutesBefore?: number;
  linkedSkillIds: string[];
  linkedResourceIds: string[];
  linkedCapabilityIds: string[];
  completionNotes: string;
  completedAt?: string;
}

export const TODO_PRIORITIES: readonly TodoPriority[] = ['Low', 'Normal', 'High', 'Urgent'];

export const EVIDENCE_KINDS: readonly EvidenceKind[] = [
  'Item photo',
  'Serial label',
  'Receipt',
  'Condition',
  'Project result',
  'Other',
];

export type ResourceClass =
  'Durable asset' | 'Consumable' | 'Software' | 'Service' | 'Workspace' | 'Document';
export type VerificationStatus =
  'Confirmed' | 'Document-supported' | 'Activity-supported' | 'Inferred' | 'Needs review';

export const RESOURCE_CLASSES: readonly ResourceClass[] = [
  'Durable asset',
  'Consumable',
  'Software',
  'Service',
  'Workspace',
  'Document',
];
export const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  'Confirmed',
  'Document-supported',
  'Activity-supported',
  'Inferred',
  'Needs review',
];

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
    attachments?: EvidenceAttachment[];
    todos?: Todo[];
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
