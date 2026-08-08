import { db, SCHEMA_VERSION, type ForgeDatabase } from '../database/db';
import type {
  Activity,
  Capability,
  CapabilityResourceRequirement,
  CapabilitySkillRequirement,
  ExportBundle,
  EvidenceAttachment,
  DocumentEvidence,
  MindNode,
  MindEdge,
  Resource,
  Skill,
  Todo,
  TodoOccurrence,
  ReminderEvent,
} from '../types/models';
import { MIND_RELATIONSHIP_TYPES, WORK_STATES } from '../types/models';

declare const __APP_VERSION__: string;

export type ImportMode = 'merge' | 'replace';
export interface ImportResult {
  skills: number;
  resources: number;
  capabilities: number;
  mindNodes: number;
  mindEdges: number;
}
export type ImportValidationResult =
  { valid: true; bundle: ExportBundle } | { valid: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isLevel = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5;
const isFiniteNonnegative = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isDate = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

function hasBaseRecord(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isDate(value.createdAt) &&
    isDate(value.updatedAt) &&
    isStringArray(value.tags) &&
    typeof value.archived === 'boolean'
  );
}

export function isSkill(value: unknown): value is Skill {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.category === 'string' &&
    isLevel(value.knowledgeLevel) &&
    isLevel(value.practicalLevel) &&
    typeof value.confidence === 'number' &&
    isFiniteNonnegative(value.confidence) &&
    value.confidence <= 100 &&
    typeof value.evidenceNotes === 'string' &&
    isStringArray(value.evidenceLinks) &&
    (value.lastUsedAt === undefined || isDate(value.lastUsedAt))
  );
}

export function isResource(value: unknown): value is Resource {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.category === 'string' &&
    typeof value.resourceType === 'string' &&
    isFiniteNonnegative(value.quantity) &&
    typeof value.unit === 'string' &&
    typeof value.condition === 'string' &&
    typeof value.location === 'string' &&
    typeof value.notes === 'string' &&
    (value.resourceClass === undefined ||
      ['Durable asset', 'Consumable', 'Software', 'Service', 'Workspace', 'Document'].includes(
        String(value.resourceClass),
      )) &&
    (value.manufacturer === undefined || typeof value.manufacturer === 'string') &&
    (value.model === undefined || typeof value.model === 'string') &&
    (value.serialNumber === undefined || typeof value.serialNumber === 'string') &&
    (value.currency === undefined || typeof value.currency === 'string') &&
    (value.verificationStatus === undefined ||
      [
        'Confirmed',
        'Document-supported',
        'Activity-supported',
        'Inferred',
        'Needs review',
      ].includes(String(value.verificationStatus))) &&
    (value.evidenceNotes === undefined || typeof value.evidenceNotes === 'string') &&
    (value.photoDataUrls === undefined || isStringArray(value.photoDataUrls))
  );
}

export function isAttachment(value: unknown): value is EvidenceAttachment {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  return (
    ['resource', 'skill', 'capability', 'activity', 'mindNode'].includes(String(value.ownerType)) &&
    typeof value.ownerId === 'string' &&
    value.ownerId.length > 0 &&
    ['Item photo', 'Serial label', 'Receipt', 'Condition', 'Project result', 'Other'].includes(
      String(value.kind),
    ) &&
    typeof value.fileName === 'string' &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(String(value.mimeType)) &&
    isFiniteNonnegative(value.byteSize) &&
    isFiniteNonnegative(value.width) &&
    isFiniteNonnegative(value.height) &&
    typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    typeof value.dataUrl === 'string' &&
    value.dataUrl.length <= 500_000 &&
    value.dataUrl.startsWith(`data:${String(value.mimeType)};base64,`) &&
    ['Confirmed', 'Document-supported', 'Activity-supported', 'Inferred', 'Needs review'].includes(
      String(value.verificationStatus),
    ) &&
    typeof value.notes === 'string'
  );
}

export function isDocumentEvidence(value: unknown): value is DocumentEvidence {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  return (
    ['resource', 'skill', 'capability', 'activity'].includes(String(value.ownerType)) &&
    typeof value.ownerId === 'string' &&
    value.ownerId.length > 0 &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    [
      'Resume',
      'Course or transcript',
      'Certificate or license',
      'Manual or specification',
      'Receipt or invoice',
      'Web reference',
      'Personal note',
      'Other',
    ].includes(String(value.sourceType)) &&
    typeof value.sourceName === 'string' &&
    value.sourceName.length > 0 &&
    (value.sourceUrl === undefined ||
      (typeof value.sourceUrl === 'string' && /^https?:\/\//.test(value.sourceUrl))) &&
    (value.issuedAt === undefined || isDate(value.issuedAt)) &&
    typeof value.excerpt === 'string' &&
    value.excerpt.length > 0 &&
    typeof value.notes === 'string' &&
    ['Confirmed', 'Document-supported', 'Activity-supported', 'Inferred', 'Needs review'].includes(
      String(value.verificationStatus),
    )
  );
}

const isEntityReference = (value: unknown) =>
  isRecord(value) &&
  ['mindNode', 'skill', 'resource', 'capability', 'todo', 'activity'].includes(
    String(value.entityType),
  ) &&
  typeof value.entityId === 'string' &&
  value.entityId.length > 0;

export function isMindNode(value: unknown): value is MindNode {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  return (
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    [
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
    ].includes(String(value.type)) &&
    (value.type !== 'custom' ||
      (typeof value.customType === 'string' && value.customType.length > 0)) &&
    typeof value.description === 'string' &&
    typeof value.notes === 'string' &&
    ['active', 'developing', 'established', 'paused'].includes(String(value.status)) &&
    typeof value.confidence === 'number' &&
    value.confidence >= 0 &&
    value.confidence <= 100 &&
    typeof value.importance === 'number' &&
    value.importance >= 0 &&
    value.importance <= 100 &&
    (value.familiarityLevel === undefined || isLevel(value.familiarityLevel)) &&
    (value.practicalLevel === undefined || isLevel(value.practicalLevel)) &&
    (value.lastReviewedAt === undefined || isDate(value.lastReviewedAt))
  );
}

export function isMindEdge(value: unknown): value is MindEdge {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  return (
    isEntityReference(value.source) &&
    isEntityReference(value.target) &&
    MIND_RELATIONSHIP_TYPES.includes(
      value.relationshipType as (typeof MIND_RELATIONSHIP_TYPES)[number],
    ) &&
    (value.relationshipType !== 'custom' ||
      (typeof value.customRelationship === 'string' && value.customRelationship.length > 0)) &&
    typeof value.notes === 'string'
  );
}

export function isTodo(value: unknown): value is Todo {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  const validChecklist =
    value.checklist === undefined ||
    (Array.isArray(value.checklist) &&
      value.checklist.every(
        (item) =>
          isRecord(item) &&
          typeof item.id === 'string' &&
          item.id.length > 0 &&
          typeof item.text === 'string' &&
          item.text.length > 0 &&
          typeof item.completed === 'boolean' &&
          (item.completedAt === undefined || isDate(item.completedAt)),
      ) &&
      new Set(value.checklist.map((item) => (isRecord(item) ? item.id : ''))).size ===
        value.checklist.length);
  const validExecution =
    value.execution === undefined ||
    (isRecord(value.execution) &&
      WORK_STATES.includes(value.execution.workState as (typeof WORK_STATES)[number]) &&
      (value.execution.nextAction === undefined ||
        typeof value.execution.nextAction === 'string') &&
      (value.execution.waitingOn === undefined || typeof value.execution.waitingOn === 'string') &&
      (value.execution.waitingCondition === undefined ||
        typeof value.execution.waitingCondition === 'string') &&
      (value.execution.blockedReason === undefined ||
        typeof value.execution.blockedReason === 'string') &&
      Array.isArray(value.execution.blockedBy) &&
      value.execution.blockedBy.every(isEntityReference) &&
      (value.execution.reviewAt === undefined || isDate(value.execution.reviewAt)) &&
      (value.execution.availableAfter === undefined || isDate(value.execution.availableAfter)) &&
      (value.execution.deadlineKind === undefined ||
        ['hard', 'target'].includes(String(value.execution.deadlineKind))) &&
      (value.execution.urgencyReason === undefined ||
        typeof value.execution.urgencyReason === 'string') &&
      isStringArray(value.execution.contexts));
  return (
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    typeof value.description === 'string' &&
    typeof value.purpose === 'string' &&
    ['Open', 'In progress', 'Completed'].includes(String(value.status)) &&
    ['Low', 'Normal', 'High', 'Urgent'].includes(String(value.priority)) &&
    (value.scheduledFor === undefined || isDate(value.scheduledFor)) &&
    (value.dueAt === undefined || isDate(value.dueAt)) &&
    (value.estimatedMinutes === undefined || isFiniteNonnegative(value.estimatedMinutes)) &&
    (value.reminderMinutesBefore === undefined ||
      isFiniteNonnegative(value.reminderMinutesBefore)) &&
    isStringArray(value.linkedSkillIds) &&
    isStringArray(value.linkedResourceIds) &&
    isStringArray(value.linkedCapabilityIds) &&
    typeof value.completionNotes === 'string' &&
    (value.completedAt === undefined || isDate(value.completedAt)) &&
    (value.recurrence === undefined ||
      (isRecord(value.recurrence) &&
        ['Daily', 'Weekly', 'Monthly'].includes(String(value.recurrence.frequency)) &&
        typeof value.recurrence.interval === 'number' &&
        Number.isInteger(value.recurrence.interval) &&
        value.recurrence.interval >= 1)) &&
    (value.snoozedUntil === undefined || isDate(value.snoozedUntil)) &&
    validChecklist &&
    validExecution
  );
}

export function isReminderEvent(value: unknown): value is ReminderEvent {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  return (
    typeof value.todoId === 'string' &&
    typeof value.occurrenceKey === 'string' &&
    typeof value.title === 'string' &&
    typeof value.purpose === 'string' &&
    (value.scheduledFor === undefined || isDate(value.scheduledFor)) &&
    (value.dueAt === undefined || isDate(value.dueAt)) &&
    isDate(value.detectedAt) &&
    (value.acknowledgedAt === undefined || isDate(value.acknowledgedAt)) &&
    (value.action === undefined ||
      ['Acknowledged', 'Snoozed', 'Completed'].includes(String(value.action))) &&
    (value.snoozedUntil === undefined || isDate(value.snoozedUntil))
  );
}

export function isTodoOccurrence(value: unknown): value is TodoOccurrence {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  return (
    typeof value.todoId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.purpose === 'string' &&
    (value.scheduledFor === undefined || isDate(value.scheduledFor)) &&
    (value.dueAt === undefined || isDate(value.dueAt)) &&
    isDate(value.completedAt) &&
    typeof value.completionNotes === 'string' &&
    (value.checklist === undefined ||
      (Array.isArray(value.checklist) &&
        value.checklist.every(
          (item) =>
            isRecord(item) &&
            typeof item.id === 'string' &&
            typeof item.text === 'string' &&
            typeof item.completed === 'boolean' &&
            (item.completedAt === undefined || isDate(item.completedAt)),
        )))
  );
}

export function isActivity(value: unknown): value is Activity {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  return (
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    typeof value.description === 'string' &&
    typeof value.purpose === 'string' &&
    value.purpose.length > 0 &&
    isDate(value.occurredAt) &&
    isFiniteNonnegative(value.durationMinutes) &&
    typeof value.outcome === 'string' &&
    typeof value.reflection === 'string' &&
    Array.isArray(value.skillPractice) &&
    value.skillPractice.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.skillId === 'string' &&
        [
          'Study',
          'Guided practice',
          'Independent application',
          'Troubleshooting',
          'Teaching',
        ].includes(String(entry.kind)) &&
        isFiniteNonnegative(entry.minutes) &&
        [
          'Confirmed',
          'Document-supported',
          'Activity-supported',
          'Inferred',
          'Needs review',
        ].includes(String(entry.verificationStatus)) &&
        typeof entry.notes === 'string',
    ) &&
    isStringArray(value.linkedResourceIds) &&
    isStringArray(value.linkedCapabilityIds) &&
    isStringArray(value.linkedTodoIds)
  );
}

function isSkillRequirement(value: unknown): value is CapabilitySkillRequirement {
  return (
    isRecord(value) &&
    typeof value.skillId === 'string' &&
    value.skillId.length > 0 &&
    isLevel(value.minimumKnowledgeLevel) &&
    isLevel(value.minimumPracticalLevel)
  );
}

function isResourceRequirement(value: unknown): value is CapabilityResourceRequirement {
  return (
    isRecord(value) &&
    typeof value.resourceId === 'string' &&
    value.resourceId.length > 0 &&
    isFiniteNonnegative(value.requiredQuantity) &&
    typeof value.unit === 'string'
  );
}

export function isCapability(value: unknown): value is Capability {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.category === 'string' &&
    Array.isArray(value.requiredSkills) &&
    value.requiredSkills.every(isSkillRequirement) &&
    Array.isArray(value.requiredResources) &&
    value.requiredResources.every(isResourceRequirement)
  );
}

function hasUniqueIds(records: readonly { id: string }[]): boolean {
  return new Set(records.map((record) => record.id)).size === records.length;
}

export function validateImport(value: unknown): ImportValidationResult {
  const errors: string[] = [];
  if (!isRecord(value))
    return { valid: false, errors: ['The selected file is not a JSON object.'] };
  if (!isDate(value.exportDate)) errors.push('Export date is missing or invalid.');
  if (typeof value.appVersion !== 'string') errors.push('App version is missing.');
  if (
    typeof value.schemaVersion !== 'number' ||
    !Number.isInteger(value.schemaVersion) ||
    value.schemaVersion < 1 ||
    value.schemaVersion > SCHEMA_VERSION
  ) {
    errors.push(`Schema version must be between 1 and ${SCHEMA_VERSION}.`);
  }
  if (!isRecord(value.records)) {
    errors.push('Records section is missing.');
    return { valid: false, errors };
  }

  const skills = value.records.skills;
  const resources = value.records.resources;
  const capabilities = value.records.capabilities;
  const attachments = value.records.attachments ?? [];
  const documentEvidence = value.records.documentEvidence ?? [];
  const todos = value.records.todos ?? [];
  const activities = value.records.activities ?? [];
  const todoOccurrences = value.records.todoOccurrences ?? [];
  const reminderEvents = value.records.reminderEvents ?? [];
  const mindNodes = value.records.mindNodes ?? [];
  const mindEdges = value.records.mindEdges ?? [];
  if (!Array.isArray(skills) || !skills.every(isSkill)) errors.push('Skills contain invalid data.');
  if (!Array.isArray(resources) || !resources.every(isResource))
    errors.push('Resources contain invalid data.');
  if (!Array.isArray(capabilities) || !capabilities.every(isCapability))
    errors.push('Capabilities contain invalid data.');
  if (!Array.isArray(attachments) || !attachments.every(isAttachment))
    errors.push('Attachments contain invalid data.');
  if (!Array.isArray(documentEvidence) || !documentEvidence.every(isDocumentEvidence))
    errors.push('Document evidence contains invalid data.');
  if (!Array.isArray(todos) || !todos.every(isTodo)) errors.push('Todos contain invalid data.');
  if (!Array.isArray(activities) || !activities.every(isActivity))
    errors.push('Activities contain invalid data.');
  if (!Array.isArray(todoOccurrences) || !todoOccurrences.every(isTodoOccurrence))
    errors.push('Todo occurrences contain invalid data.');
  if (!Array.isArray(reminderEvents) || !reminderEvents.every(isReminderEvent))
    errors.push('Reminder events contain invalid data.');
  if (!Array.isArray(mindNodes) || !mindNodes.every(isMindNode))
    errors.push('Mind nodes contain invalid data.');
  if (!Array.isArray(mindEdges) || !mindEdges.every(isMindEdge))
    errors.push('Mind relationships contain invalid data.');
  if (errors.length) return { valid: false, errors };

  const bundle = value as unknown as ExportBundle;
  if (!hasUniqueIds(bundle.records.skills)) errors.push('Skills contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.resources)) errors.push('Resources contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.capabilities))
    errors.push('Capabilities contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.attachments ?? []))
    errors.push('Attachments contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.documentEvidence ?? []))
    errors.push('Document evidence contains duplicate IDs.');
  if (!hasUniqueIds(bundle.records.todos ?? [])) errors.push('Todos contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.activities ?? []))
    errors.push('Activities contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.todoOccurrences ?? []))
    errors.push('Todo occurrences contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.reminderEvents ?? []))
    errors.push('Reminder events contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.mindNodes ?? []))
    errors.push('Mind nodes contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.mindEdges ?? []))
    errors.push('Mind relationships contain duplicate IDs.');
  const graphRecordIds = new Set([
    ...(bundle.records.mindNodes ?? []).map((item) => `mindNode:${item.id}`),
    ...bundle.records.skills.map((item) => `skill:${item.id}`),
    ...bundle.records.resources.map((item) => `resource:${item.id}`),
    ...bundle.records.capabilities.map((item) => `capability:${item.id}`),
    ...(bundle.records.todos ?? []).map((item) => `todo:${item.id}`),
    ...(bundle.records.activities ?? []).map((item) => `activity:${item.id}`),
  ]);
  for (const todo of bundle.records.todos ?? []) {
    for (const blocker of todo.execution?.blockedBy ?? []) {
      if (!graphRecordIds.has(`${blocker.entityType}:${blocker.entityId}`))
        errors.push(`Todo ${todo.id} has a missing blocker reference.`);
    }
  }
  for (const edge of bundle.records.mindEdges ?? []) {
    if (!graphRecordIds.has(`${edge.source.entityType}:${edge.source.entityId}`))
      errors.push(`Mind relationship ${edge.id} has a missing source.`);
    if (!graphRecordIds.has(`${edge.target.entityType}:${edge.target.entityId}`))
      errors.push(`Mind relationship ${edge.id} has a missing target.`);
    if (
      edge.source.entityType === edge.target.entityType &&
      edge.source.entityId === edge.target.entityId
    )
      errors.push(`Mind relationship ${edge.id} connects a record to itself.`);
    if (edge.source.entityType !== 'mindNode' && edge.target.entityType !== 'mindNode')
      errors.push(`Mind relationship ${edge.id} does not include a mind node.`);
  }
  const activeRelationshipKeys = (bundle.records.mindEdges ?? [])
    .filter((edge) => !edge.archived)
    .map(
      (edge) =>
        `${edge.source.entityType}:${edge.source.entityId}|${edge.relationshipType}|${edge.customRelationship?.trim().toLowerCase() ?? ''}|${edge.target.entityType}:${edge.target.entityId}`,
    );
  if (new Set(activeRelationshipKeys).size !== activeRelationshipKeys.length)
    errors.push('Mind relationships contain duplicate active connections.');
  return errors.length ? { valid: false, errors } : { valid: true, bundle };
}

function newerRecords<T extends { id: string; updatedAt: string }>(local: T[], incoming: T[]): T[] {
  const merged = new Map(local.map((record) => [record.id, record]));
  for (const record of incoming) {
    const current = merged.get(record.id);
    if (!current || Date.parse(record.updatedAt) >= Date.parse(current.updatedAt)) {
      merged.set(record.id, record);
    }
  }
  return [...merged.values()];
}

export async function importData(
  bundle: ExportBundle,
  mode: ImportMode,
  database: ForgeDatabase = db,
): Promise<ImportResult> {
  await database.transaction(
    'rw',
    [
      database.skills,
      database.resources,
      database.capabilities,
      database.attachments,
      database.documentEvidence,
      database.todos,
      database.activities,
      database.todoOccurrences,
      database.reminderEvents,
      database.mindNodes,
      database.mindEdges,
    ],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          database.skills.clear(),
          database.resources.clear(),
          database.capabilities.clear(),
          database.attachments.clear(),
          database.documentEvidence.clear(),
          database.todos.clear(),
          database.activities.clear(),
          database.todoOccurrences.clear(),
          database.reminderEvents.clear(),
          database.mindNodes.clear(),
          database.mindEdges.clear(),
        ]);
        await database.skills.bulkPut(bundle.records.skills);
        await database.resources.bulkPut(bundle.records.resources);
        await database.capabilities.bulkPut(bundle.records.capabilities);
        await database.attachments.bulkPut(bundle.records.attachments ?? []);
        await database.documentEvidence.bulkPut(bundle.records.documentEvidence ?? []);
        await database.todos.bulkPut(bundle.records.todos ?? []);
        await database.activities.bulkPut(bundle.records.activities ?? []);
        await database.todoOccurrences.bulkPut(bundle.records.todoOccurrences ?? []);
        await database.reminderEvents.bulkPut(bundle.records.reminderEvents ?? []);
        await database.mindNodes.bulkPut(bundle.records.mindNodes ?? []);
        await database.mindEdges.bulkPut(bundle.records.mindEdges ?? []);
        return;
      }

      await database.skills.bulkPut(
        newerRecords(await database.skills.toArray(), bundle.records.skills),
      );
      await database.resources.bulkPut(
        newerRecords(await database.resources.toArray(), bundle.records.resources),
      );
      await database.capabilities.bulkPut(
        newerRecords(await database.capabilities.toArray(), bundle.records.capabilities),
      );
      await database.attachments.bulkPut(
        newerRecords(await database.attachments.toArray(), bundle.records.attachments ?? []),
      );
      await database.documentEvidence.bulkPut(
        newerRecords(
          await database.documentEvidence.toArray(),
          bundle.records.documentEvidence ?? [],
        ),
      );
      await database.todos.bulkPut(
        newerRecords(await database.todos.toArray(), bundle.records.todos ?? []),
      );
      await database.activities.bulkPut(
        newerRecords(await database.activities.toArray(), bundle.records.activities ?? []),
      );
      await database.todoOccurrences.bulkPut(
        newerRecords(
          await database.todoOccurrences.toArray(),
          bundle.records.todoOccurrences ?? [],
        ),
      );
      await database.reminderEvents.bulkPut(
        newerRecords(await database.reminderEvents.toArray(), bundle.records.reminderEvents ?? []),
      );
      await database.mindNodes.bulkPut(
        newerRecords(await database.mindNodes.toArray(), bundle.records.mindNodes ?? []),
      );
      await database.mindEdges.bulkPut(
        newerRecords(await database.mindEdges.toArray(), bundle.records.mindEdges ?? []),
      );
    },
  );
  return {
    skills: bundle.records.skills.length,
    resources: bundle.records.resources.length,
    capabilities: bundle.records.capabilities.length,
    mindNodes: bundle.records.mindNodes?.length ?? 0,
    mindEdges: bundle.records.mindEdges?.length ?? 0,
  };
}

export async function createExport(database: ForgeDatabase = db): Promise<ExportBundle> {
  return {
    exportDate: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    schemaVersion: SCHEMA_VERSION,
    records: {
      skills: await database.skills.toArray(),
      resources: await database.resources.toArray(),
      capabilities: await database.capabilities.toArray(),
      attachments: await database.attachments.toArray(),
      documentEvidence: await database.documentEvidence.toArray(),
      todos: await database.todos.toArray(),
      activities: await database.activities.toArray(),
      todoOccurrences: await database.todoOccurrences.toArray(),
      reminderEvents: await database.reminderEvents.toArray(),
      mindNodes: await database.mindNodes.toArray(),
      mindEdges: await database.mindEdges.toArray(),
    },
  };
}

export function downloadExport(bundle: ExportBundle) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `forge-backup-${bundle.exportDate.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
