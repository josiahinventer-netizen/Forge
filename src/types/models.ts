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

export type EvidenceOwnerType = 'resource' | 'skill' | 'capability' | 'activity' | 'mindNode';
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

export type DocumentEvidenceSourceType =
  | 'Resume'
  | 'Course or transcript'
  | 'Certificate or license'
  | 'Manual or specification'
  | 'Receipt or invoice'
  | 'Web reference'
  | 'Personal note'
  | 'Other';

export interface DocumentEvidence extends BaseRecord {
  ownerType: EvidenceOwnerType;
  ownerId: string;
  title: string;
  sourceType: DocumentEvidenceSourceType;
  sourceName: string;
  sourceUrl?: string;
  issuedAt?: string;
  excerpt: string;
  notes: string;
  verificationStatus: VerificationStatus;
}

export type MindNodeType =
  | 'identity'
  | 'value'
  | 'belief'
  | 'principle'
  | 'goal'
  | 'interest'
  | 'knowledge'
  | 'concept'
  | 'project'
  | 'person'
  | 'experience'
  | 'habit'
  | 'question'
  | 'custom';
export type MindNodeStatus = 'active' | 'developing' | 'established' | 'paused';

export interface MindNode extends BaseRecord {
  title: string;
  type: MindNodeType;
  customType?: string;
  description: string;
  notes: string;
  status: MindNodeStatus;
  confidence: number;
  importance: number;
  familiarityLevel?: Level;
  practicalLevel?: Level;
  lastReviewedAt?: string;
}

export type GraphEntityType =
  'mindNode' | 'skill' | 'resource' | 'capability' | 'todo' | 'activity';

export interface EntityReference {
  entityType: GraphEntityType;
  entityId: string;
}

export type MindRelationshipType =
  | 'parent of'
  | 'part of'
  | 'depends on'
  | 'prerequisite for'
  | 'related to'
  | 'supports'
  | 'conflicts with'
  | 'derived from'
  | 'used by'
  | 'learned from'
  | 'contributes to'
  | 'motivated by'
  | 'requires'
  | 'applies to'
  | 'custom';

export interface MindEdge extends BaseRecord {
  source: EntityReference;
  target: EntityReference;
  relationshipType: MindRelationshipType;
  customRelationship?: string;
  notes: string;
}

export type TodoStatus = 'Open' | 'In progress' | 'Completed';
export type TodoPriority = 'Low' | 'Normal' | 'High' | 'Urgent';
export type RecurrenceFrequency = 'Daily' | 'Weekly' | 'Monthly';

export interface TodoRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;
}

export interface TodoChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string;
}

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
  recurrence?: TodoRecurrence;
  snoozedUntil?: string;
  checklist?: TodoChecklistItem[];
}

export type ReminderAction = 'Acknowledged' | 'Snoozed' | 'Completed';

export interface ReminderEvent extends BaseRecord {
  todoId: string;
  occurrenceKey: string;
  title: string;
  purpose: string;
  scheduledFor?: string;
  dueAt?: string;
  detectedAt: string;
  acknowledgedAt?: string;
  action?: ReminderAction;
  snoozedUntil?: string;
}

export interface TodoOccurrence extends BaseRecord {
  todoId: string;
  title: string;
  purpose: string;
  scheduledFor?: string;
  dueAt?: string;
  completedAt: string;
  completionNotes: string;
  checklist?: TodoChecklistItem[];
}

export type PracticeKind =
  'Study' | 'Guided practice' | 'Independent application' | 'Troubleshooting' | 'Teaching';

export interface ActivitySkillPractice {
  skillId: string;
  kind: PracticeKind;
  minutes: number;
  verificationStatus: VerificationStatus;
  notes: string;
}

export interface Activity extends BaseRecord {
  title: string;
  description: string;
  purpose: string;
  occurredAt: string;
  durationMinutes: number;
  outcome: string;
  reflection: string;
  skillPractice: ActivitySkillPractice[];
  linkedResourceIds: string[];
  linkedCapabilityIds: string[];
  linkedTodoIds: string[];
}

export const PRACTICE_KINDS: readonly PracticeKind[] = [
  'Study',
  'Guided practice',
  'Independent application',
  'Troubleshooting',
  'Teaching',
];

export const TODO_PRIORITIES: readonly TodoPriority[] = ['Low', 'Normal', 'High', 'Urgent'];

export const EVIDENCE_KINDS: readonly EvidenceKind[] = [
  'Item photo',
  'Serial label',
  'Receipt',
  'Condition',
  'Project result',
  'Other',
];

export const DOCUMENT_EVIDENCE_SOURCE_TYPES: readonly DocumentEvidenceSourceType[] = [
  'Resume',
  'Course or transcript',
  'Certificate or license',
  'Manual or specification',
  'Receipt or invoice',
  'Web reference',
  'Personal note',
  'Other',
];

export const MIND_NODE_TYPES: readonly MindNodeType[] = [
  'identity',
  'value',
  'belief',
  'principle',
  'goal',
  'interest',
  'knowledge',
  'concept',
  'project',
  'person',
  'experience',
  'habit',
  'question',
  'custom',
];

export const MIND_NODE_STATUSES: readonly MindNodeStatus[] = [
  'active',
  'developing',
  'established',
  'paused',
];

export const MIND_RELATIONSHIP_TYPES: readonly MindRelationshipType[] = [
  'parent of',
  'part of',
  'depends on',
  'prerequisite for',
  'related to',
  'supports',
  'conflicts with',
  'derived from',
  'used by',
  'learned from',
  'contributes to',
  'motivated by',
  'requires',
  'applies to',
  'custom',
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
    documentEvidence?: DocumentEvidence[];
    mindNodes?: MindNode[];
    mindEdges?: MindEdge[];
    todos?: Todo[];
    activities?: Activity[];
    todoOccurrences?: TodoOccurrence[];
    reminderEvents?: ReminderEvent[];
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
