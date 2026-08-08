import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { ForgeSyncStore } from './store.js';
import type { ArchiveRecord, SyncChangeInput, SyncEntityType } from './types.js';

export const DRIVE_ARCHIVE_VERSION = 1;
export const DRIVE_INBOX_VERSION = 1;

const baseFields = {
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  archived: z.boolean().optional(),
};
const skillOperation = z.object({
  operation: z.literal('save'),
  entityType: z.literal('skill'),
  record: z.object({
    ...baseFields,
    knowledgeLevel: z.number().int().min(0).max(5).optional(),
    practicalLevel: z.number().int().min(0).max(5).optional(),
    confidence: z.number().min(0).max(100).optional(),
    evidenceNotes: z.string().optional(),
    evidenceLinks: z.array(z.string()).optional(),
    lastUsedAt: z.string().datetime().optional(),
  }),
});
const resourceOperation = z.object({
  operation: z.literal('save'),
  entityType: z.literal('resource'),
  record: z.object({
    ...baseFields,
    resourceType: z.string().optional(),
    quantity: z.number().min(0).optional(),
    unit: z.string().optional(),
    condition: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
    resourceClass: z
      .enum(['Durable asset', 'Consumable', 'Software', 'Service', 'Workspace', 'Document'])
      .optional(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    serialNumber: z.string().optional(),
    expectedLifeMonths: z.number().min(0).optional(),
    maintenanceIntervalDays: z.number().min(0).optional(),
    replacementValue: z.number().min(0).optional(),
    currency: z.string().optional(),
    verificationStatus: z
      .enum(['Confirmed', 'Document-supported', 'Activity-supported', 'Inferred', 'Needs review'])
      .optional(),
    evidenceNotes: z.string().optional(),
  }),
});
const skillRequirement = z.object({
  skillId: z.string().min(1),
  minimumKnowledgeLevel: z.number().int().min(0).max(5),
  minimumPracticalLevel: z.number().int().min(0).max(5),
});
const resourceRequirement = z.object({
  resourceId: z.string().min(1),
  requiredQuantity: z.number().min(0),
  unit: z.string(),
});
const documentEvidenceOperation = z.object({
  operation: z.literal('save'),
  entityType: z.literal('documentEvidence'),
  record: z.object({
    id: z.string().min(1).optional(),
    ownerType: z.enum(['resource', 'skill', 'capability', 'activity', 'mindNode']),
    ownerId: z.string().min(1),
    title: z.string().min(1),
    sourceType: z.enum([
      'Resume',
      'Course or transcript',
      'Certificate or license',
      'Manual or specification',
      'Receipt or invoice',
      'Web reference',
      'Personal note',
      'Other',
    ]),
    sourceName: z.string().min(1),
    sourceUrl: z.string().url().startsWith('http').optional(),
    issuedAt: z.string().datetime().optional(),
    excerpt: z.string().min(1),
    notes: z.string().optional(),
    verificationStatus: z.enum([
      'Confirmed',
      'Document-supported',
      'Activity-supported',
      'Inferred',
      'Needs review',
    ]),
    tags: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
  }),
});
const graphEntityReference = z.object({
  entityType: z.enum(['mindNode', 'skill', 'resource', 'capability', 'todo', 'activity']),
  entityId: z.string().min(1),
});
const mindNodeOperation = z.object({
  operation: z.literal('save'),
  entityType: z.literal('mindNode'),
  record: z.object({
    id: z.string().min(1).optional(),
    title: z.string().min(1),
    type: z.enum([
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
    ]),
    customType: z.string().min(1).optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(['active', 'developing', 'established', 'paused']).optional(),
    confidence: z.number().min(0).max(100).optional(),
    importance: z.number().min(0).max(100).optional(),
    familiarityLevel: z.number().int().min(0).max(5).optional(),
    practicalLevel: z.number().int().min(0).max(5).optional(),
    lastReviewedAt: z.string().datetime().optional(),
    tags: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
  }),
});
const mindEdgeOperation = z.object({
  operation: z.literal('save'),
  entityType: z.literal('mindEdge'),
  record: z.object({
    id: z.string().min(1).optional(),
    source: graphEntityReference,
    target: graphEntityReference,
    relationshipType: z.enum([
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
    ]),
    customRelationship: z.string().min(1).optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
  }),
});
const capabilityOperation = z.object({
  operation: z.literal('save'),
  entityType: z.literal('capability'),
  record: z.object({
    ...baseFields,
    requiredSkills: z.array(skillRequirement).optional(),
    requiredResources: z.array(resourceRequirement).optional(),
  }),
});
const todoOperation = z.object({
  operation: z.literal('save'),
  entityType: z.literal('todo'),
  record: z.object({
    id: z.string().min(1).optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
    title: z.string().min(1),
    purpose: z.string().min(1),
    status: z.enum(['Open', 'In progress', 'Completed']).optional(),
    priority: z.enum(['Low', 'Normal', 'High', 'Urgent']).optional(),
    scheduledFor: z.string().datetime().optional(),
    dueAt: z.string().datetime().optional(),
    estimatedMinutes: z.number().min(0).optional(),
    reminderMinutesBefore: z.number().min(0).optional(),
    linkedSkillIds: z.array(z.string()).optional(),
    linkedResourceIds: z.array(z.string()).optional(),
    linkedCapabilityIds: z.array(z.string()).optional(),
    completionNotes: z.string().optional(),
    checklist: z
      .array(
        z.object({
          id: z.string().min(1).optional(),
          text: z.string().min(1),
          completed: z.boolean().optional(),
          completedAt: z.string().datetime().optional(),
        }),
      )
      .optional(),
    recurrence: z
      .object({
        frequency: z.enum(['Daily', 'Weekly', 'Monthly']),
        interval: z.number().int().min(1).max(365),
      })
      .optional(),
  }),
});
const activityOperation = z.object({
  operation: z.literal('save'),
  entityType: z.literal('activity'),
  record: z.object({
    id: z.string().min(1).optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    purpose: z.string().min(1),
    occurredAt: z.string().datetime(),
    durationMinutes: z.number().min(0),
    outcome: z.string().optional(),
    reflection: z.string().optional(),
    tags: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
    skillPractice: z
      .array(
        z.object({
          skillId: z.string().min(1),
          kind: z.enum([
            'Study',
            'Guided practice',
            'Independent application',
            'Troubleshooting',
            'Teaching',
          ]),
          minutes: z.number().min(0),
          verificationStatus: z.enum([
            'Confirmed',
            'Document-supported',
            'Activity-supported',
            'Inferred',
            'Needs review',
          ]),
          notes: z.string().optional(),
        }),
      )
      .optional(),
    linkedResourceIds: z.array(z.string()).optional(),
    linkedCapabilityIds: z.array(z.string()).optional(),
    linkedTodoIds: z.array(z.string()).optional(),
  }),
});
export const driveInboxRequestSchema = z.object({
  forgeInboxVersion: z.literal(DRIVE_INBOX_VERSION),
  requestId: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  summary: z.string().min(1).max(500),
  operations: z
    .array(
      z.union([
        skillOperation,
        resourceOperation,
        capabilityOperation,
        todoOperation,
        activityOperation,
        documentEvidenceOperation,
        mindNodeOperation,
        mindEdgeOperation,
      ]),
    )
    .min(1)
    .max(50),
});
export type DriveInboxRequest = z.infer<typeof driveInboxRequestSchema>;

const defaults: Record<SyncEntityType, Record<string, unknown>> = {
  skill: {
    description: '',
    category: 'General',
    knowledgeLevel: 0,
    practicalLevel: 0,
    confidence: 50,
    evidenceNotes: '',
    evidenceLinks: [],
  },
  resource: {
    description: '',
    category: 'General',
    resourceType: 'Other',
    quantity: 1,
    unit: 'item',
    condition: '',
    location: '',
    notes: '',
    resourceClass: 'Durable asset',
    manufacturer: '',
    model: '',
    serialNumber: '',
    currency: 'USD',
    verificationStatus: 'Confirmed',
    evidenceNotes: '',
    photoDataUrls: [],
  },
  attachment: {},
  documentEvidence: { notes: '' },
  mindNode: {
    description: '',
    notes: '',
    status: 'active',
    confidence: 50,
    importance: 50,
  },
  mindEdge: { notes: '' },
  todo: {
    description: '',
    purpose: '',
    status: 'Open',
    priority: 'Normal',
    linkedSkillIds: [],
    linkedResourceIds: [],
    linkedCapabilityIds: [],
    completionNotes: '',
    checklist: [],
  },
  capability: { description: '', category: 'General', requiredSkills: [], requiredResources: [] },
  activity: {
    description: '',
    purpose: '',
    durationMinutes: 0,
    outcome: '',
    reflection: '',
    skillPractice: [],
    linkedResourceIds: [],
    linkedCapabilityIds: [],
    linkedTodoIds: [],
  },
  todoOccurrence: {},
  reminderEvent: {},
};

const payload = (record: ArchiveRecord | null) => record?.payload ?? null;
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = (headers: string[], rows: unknown[][]) =>
  [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function createDriveArchive(
  username: string,
  records: ArchiveRecord[],
  generatedAt = new Date().toISOString(),
) {
  const live = records.filter((record) => !record.deleted && record.payload);
  return {
    forgeArchiveVersion: DRIVE_ARCHIVE_VERSION,
    generatedAt,
    username,
    records: {
      skills: live
        .filter((record) => record.entityType === 'skill')
        .map((record) => record.payload),
      resources: live
        .filter((record) => record.entityType === 'resource')
        .map((record) => record.payload),
      capabilities: live
        .filter((record) => record.entityType === 'capability')
        .map((record) => record.payload),
      attachments: live
        .filter((record) => record.entityType === 'attachment')
        .map((record) => {
          const { dataUrl: _dataUrl, ...metadata } = record.payload ?? {};
          void _dataUrl;
          const extension =
            metadata.mimeType === 'image/png'
              ? 'png'
              : metadata.mimeType === 'image/webp'
                ? 'webp'
                : 'jpg';
          return { ...metadata, driveFile: `Evidence/${record.recordId}.${extension}` };
        }),
      documentEvidence: live
        .filter((record) => record.entityType === 'documentEvidence')
        .map((record) => record.payload),
      mindNodes: live
        .filter((record) => record.entityType === 'mindNode')
        .map((record) => record.payload),
      mindEdges: live
        .filter((record) => record.entityType === 'mindEdge')
        .map((record) => record.payload),
      todos: live.filter((record) => record.entityType === 'todo').map((record) => record.payload),
      activities: live
        .filter((record) => record.entityType === 'activity')
        .map((record) => record.payload),
      todoOccurrences: live
        .filter((record) => record.entityType === 'todoOccurrence')
        .map((record) => record.payload),
      reminderEvents: live
        .filter((record) => record.entityType === 'reminderEvent')
        .map((record) => record.payload),
    },
    deletedRecords: records
      .filter((record) => record.deleted)
      .map(({ entityType, recordId, updatedAt }) => ({ entityType, recordId, updatedAt })),
  };
}

export function archiveCsvFiles(archive: ReturnType<typeof createDriveArchive>) {
  const skills = archive.records.skills;
  const resources = archive.records.resources;
  const capabilities = archive.records.capabilities;
  const todos = archive.records.todos;
  const activities = archive.records.activities;
  const todoOccurrences = archive.records.todoOccurrences;
  const reminderEvents = archive.records.reminderEvents;
  const documentEvidence = archive.records.documentEvidence;
  const mindNodes = archive.records.mindNodes;
  const mindEdges = archive.records.mindEdges;
  return {
    'Forge Skills.csv': csv(
      [
        'id',
        'name',
        'category',
        'knowledgeLevel',
        'practicalLevel',
        'confidence',
        'archived',
        'tags',
        'updatedAt',
      ],
      skills.map((item) => [
        item?.id,
        item?.name,
        item?.category,
        item?.knowledgeLevel,
        item?.practicalLevel,
        item?.confidence,
        item?.archived,
        Array.isArray(item?.tags) ? item.tags.join('; ') : '',
        item?.updatedAt,
      ]),
    ),
    'Forge Resources.csv': csv(
      [
        'id',
        'name',
        'category',
        'type',
        'quantity',
        'unit',
        'condition',
        'location',
        'archived',
        'tags',
        'updatedAt',
      ],
      resources.map((item) => [
        item?.id,
        item?.name,
        item?.category,
        item?.resourceType,
        item?.quantity,
        item?.unit,
        item?.condition,
        item?.location,
        item?.archived,
        Array.isArray(item?.tags) ? item.tags.join('; ') : '',
        item?.updatedAt,
      ]),
    ),
    'Forge Capabilities.csv': csv(
      [
        'id',
        'name',
        'category',
        'archived',
        'requiredSkills',
        'requiredResources',
        'tags',
        'updatedAt',
      ],
      capabilities.map((item) => [
        item?.id,
        item?.name,
        item?.category,
        item?.archived,
        JSON.stringify(item?.requiredSkills ?? []),
        JSON.stringify(item?.requiredResources ?? []),
        Array.isArray(item?.tags) ? item.tags.join('; ') : '',
        item?.updatedAt,
      ]),
    ),
    'Forge Todos.csv': csv(
      [
        'id',
        'title',
        'status',
        'priority',
        'purpose',
        'scheduledFor',
        'dueAt',
        'estimatedMinutes',
        'completedAt',
        'checklist',
        'archived',
        'updatedAt',
      ],
      todos.map((item) => [
        item?.id,
        item?.title,
        item?.status,
        item?.priority,
        item?.purpose,
        item?.scheduledFor,
        item?.dueAt,
        item?.estimatedMinutes,
        item?.completedAt,
        JSON.stringify(item?.checklist ?? []),
        item?.archived,
        item?.updatedAt,
      ]),
    ),
    'Forge Activities.csv': csv(
      [
        'id',
        'title',
        'purpose',
        'occurredAt',
        'durationMinutes',
        'outcome',
        'skillPractice',
        'archived',
        'updatedAt',
      ],
      activities.map((item) => [
        item?.id,
        item?.title,
        item?.purpose,
        item?.occurredAt,
        item?.durationMinutes,
        item?.outcome,
        JSON.stringify(item?.skillPractice ?? []),
        item?.archived,
        item?.updatedAt,
      ]),
    ),
    'Forge Document Evidence.csv': csv(
      [
        'id',
        'ownerType',
        'ownerId',
        'title',
        'sourceType',
        'sourceName',
        'sourceUrl',
        'issuedAt',
        'excerpt',
        'notes',
        'verificationStatus',
        'archived',
        'updatedAt',
      ],
      documentEvidence.map((item) => [
        item?.id,
        item?.ownerType,
        item?.ownerId,
        item?.title,
        item?.sourceType,
        item?.sourceName,
        item?.sourceUrl,
        item?.issuedAt,
        item?.excerpt,
        item?.notes,
        item?.verificationStatus,
        item?.archived,
        item?.updatedAt,
      ]),
    ),
    'Forge Mind Nodes.csv': csv(
      [
        'id',
        'title',
        'type',
        'customType',
        'status',
        'description',
        'notes',
        'confidence',
        'importance',
        'familiarityLevel',
        'practicalLevel',
        'tags',
        'archived',
        'updatedAt',
      ],
      mindNodes.map((item) => [
        item?.id,
        item?.title,
        item?.type,
        item?.customType,
        item?.status,
        item?.description,
        item?.notes,
        item?.confidence,
        item?.importance,
        item?.familiarityLevel,
        item?.practicalLevel,
        Array.isArray(item?.tags) ? item.tags.join('; ') : '',
        item?.archived,
        item?.updatedAt,
      ]),
    ),
    'Forge Mind Relationships.csv': csv(
      [
        'id',
        'sourceType',
        'sourceId',
        'relationshipType',
        'customRelationship',
        'targetType',
        'targetId',
        'notes',
        'archived',
        'updatedAt',
      ],
      mindEdges.map((item) => [
        item?.id,
        (item?.source as Record<string, unknown> | undefined)?.entityType,
        (item?.source as Record<string, unknown> | undefined)?.entityId,
        item?.relationshipType,
        item?.customRelationship,
        (item?.target as Record<string, unknown> | undefined)?.entityType,
        (item?.target as Record<string, unknown> | undefined)?.entityId,
        item?.notes,
        item?.archived,
        item?.updatedAt,
      ]),
    ),
    'Forge Todo History.csv': csv(
      [
        'id',
        'todoId',
        'title',
        'purpose',
        'scheduledFor',
        'dueAt',
        'completedAt',
        'completionNotes',
        'checklist',
      ],
      todoOccurrences.map((item) => [
        item?.id,
        item?.todoId,
        item?.title,
        item?.purpose,
        item?.scheduledFor,
        item?.dueAt,
        item?.completedAt,
        item?.completionNotes,
        JSON.stringify(item?.checklist ?? []),
      ]),
    ),
    'Forge Reminder History.csv': csv(
      [
        'id',
        'todoId',
        'title',
        'purpose',
        'scheduledFor',
        'dueAt',
        'detectedAt',
        'acknowledgedAt',
        'action',
        'snoozedUntil',
      ],
      reminderEvents.map((item) => [
        item?.id,
        item?.todoId,
        item?.title,
        item?.purpose,
        item?.scheduledFor,
        item?.dueAt,
        item?.detectedAt,
        item?.acknowledgedAt,
        item?.action,
        item?.snoozedUntil,
      ]),
    ),
  };
}

function atomicWrite(path: string, contents: string) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, contents, 'utf8');
  renameSync(temporary, path);
}

function buildChanges(
  store: ForgeSyncStore,
  accountId: string,
  request: DriveInboxRequest,
): SyncChangeInput[] {
  const timestamp = new Date().toISOString();
  const changes: SyncChangeInput[] = request.operations.map((item, index) => {
    const deterministicId = `drive-${createHash('sha256')
      .update(`${request.requestId}:${index}:${item.entityType}`)
      .digest('hex')
      .slice(0, 32)}`;
    const id = item.record.id ?? deterministicId;
    const existing = payload(store.archiveRecord(accountId, item.entityType, id));
    const record = {
      ...defaults[item.entityType],
      ...(existing ?? {}),
      ...item.record,
      id,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      tags: item.record.tags ?? existing?.tags ?? [],
      archived: item.record.archived ?? existing?.archived ?? false,
    };
    const recordFields: Record<string, unknown> = record;
    if (item.entityType === 'todo' && Array.isArray(recordFields.checklist)) {
      const checklist = recordFields.checklist as Array<{
        id?: string;
        text: string;
        completed?: boolean;
        completedAt?: string;
      }>;
      recordFields.checklist = checklist.map((step, stepIndex) => ({
        ...step,
        id:
          step.id ??
          `drive-checklist-${createHash('sha256')
            .update(`${request.requestId}:${index}:${stepIndex}`)
            .digest('hex')
            .slice(0, 32)}`,
        completed: step.completed ?? false,
      }));
    }
    return {
      entityType: item.entityType,
      recordId: id,
      updatedAt: timestamp,
      deleted: false,
      payload: recordFields,
    };
  });
  const current = new Map(
    store
      .archiveRecords(accountId)
      .filter((item) => !item.deleted)
      .map((item) => [`${item.entityType}:${item.recordId}`, item]),
  );
  for (const change of changes)
    current.set(`${change.entityType}:${change.recordId}`, { ...change });
  for (const change of changes.filter((item) => item.entityType === 'capability')) {
    const capability = change.payload;
    for (const requirement of (capability?.requiredSkills ?? []) as Array<{ skillId: string }>) {
      const requirementRecord = current.get(`skill:${requirement.skillId}`);
      if (!requirementRecord || requirementRecord.payload?.archived === true)
        throw new Error(`Required skill ${requirement.skillId} is missing or archived.`);
    }
    for (const requirement of (capability?.requiredResources ?? []) as Array<{
      resourceId: string;
    }>) {
      const requirementRecord = current.get(`resource:${requirement.resourceId}`);
      if (!requirementRecord || requirementRecord.payload?.archived === true)
        throw new Error(`Required resource ${requirement.resourceId} is missing or archived.`);
    }
  }
  for (const change of changes.filter((item) => item.entityType === 'activity')) {
    const activity = change.payload;
    for (const entry of (activity?.skillPractice ?? []) as Array<{ skillId: string }>) {
      const record = current.get(`skill:${entry.skillId}`);
      if (!record || record.payload?.archived === true)
        throw new Error(`Activity skill ${entry.skillId} is missing or archived.`);
    }
    for (const [field, entityType] of [
      ['linkedResourceIds', 'resource'],
      ['linkedCapabilityIds', 'capability'],
      ['linkedTodoIds', 'todo'],
    ] as const) {
      for (const id of (activity?.[field] ?? []) as string[]) {
        const record = current.get(`${entityType}:${id}`);
        if (!record || record.payload?.archived === true)
          throw new Error(`Activity ${entityType} ${id} is missing or archived.`);
      }
    }
  }
  for (const change of changes.filter((item) => item.entityType === 'documentEvidence')) {
    const ownerType = String(change.payload?.ownerType);
    const ownerId = String(change.payload?.ownerId);
    const owner = current.get(`${ownerType}:${ownerId}`);
    if (!owner || owner.payload?.archived === true)
      throw new Error(`Document evidence owner ${ownerType} ${ownerId} is missing or archived.`);
  }
  for (const change of changes.filter((item) => item.entityType === 'mindNode')) {
    if (change.payload?.type === 'custom' && !String(change.payload.customType ?? '').trim())
      throw new Error('A custom mind node needs a custom type name.');
  }
  for (const change of changes.filter((item) => item.entityType === 'mindEdge')) {
    const source = change.payload?.source as
      { entityType?: unknown; entityId?: unknown } | undefined;
    const target = change.payload?.target as
      { entityType?: unknown; entityId?: unknown } | undefined;
    const sourceKey = `${String(source?.entityType)}:${String(source?.entityId)}`;
    const targetKey = `${String(target?.entityType)}:${String(target?.entityId)}`;
    const sourceRecord = current.get(sourceKey);
    const targetRecord = current.get(targetKey);
    if (!sourceRecord || sourceRecord.payload?.archived === true)
      throw new Error(`Mind relationship source ${sourceKey} is missing or archived.`);
    if (!targetRecord || targetRecord.payload?.archived === true)
      throw new Error(`Mind relationship target ${targetKey} is missing or archived.`);
    if (sourceKey === targetKey)
      throw new Error('A mind relationship must connect two different records.');
    if (source?.entityType !== 'mindNode' && target?.entityType !== 'mindNode')
      throw new Error('At least one side of a mind relationship must be a mind node.');
    if (
      change.payload?.relationshipType === 'custom' &&
      !String(change.payload.customRelationship ?? '').trim()
    )
      throw new Error('A custom mind relationship needs a label.');
  }
  return changes;
}

export interface DriveBridgeOptions {
  driveDirectory: string;
  username: string;
  store: ForgeSyncStore;
}

export class ForgeDriveBridge {
  private readonly accountId: string;
  private lastArchiveHash = '';
  constructor(private readonly options: DriveBridgeOptions) {
    const accountId = options.store.accountIdForUsername(options.username);
    if (!accountId) throw new Error(`Forge account ${options.username} was not found.`);
    this.accountId = accountId;
  }

  initialize() {
    for (const folder of ['', 'Inbox', 'Processed', 'Rejected', 'Backups', 'Excel', 'Evidence'])
      mkdirSync(join(this.options.driveDirectory, folder), { recursive: true });
    atomicWrite(
      join(this.options.driveDirectory, 'CHATGPT-FORGE-INSTRUCTIONS.md'),
      `# Forge archive instructions\n\nRead **Forge Archive.json** before changing Forge. When Josiah clearly says to add or log something in Forge, that statement authorizes one non-destructive create request: correct obvious spelling and capitalization, check the archive for duplicates, infer only conservative defaults, and immediately create one file named \`forge-request-<unique-id>.json\` in **Inbox** using **Forge Inbox Example.json** or **Forge Mind Inbox Example.json** as the schema. Do not ask for a second confirmation unless the intended record type or identity is genuinely ambiguous. Preserve uncertainty in notes instead of inventing experience, quantities, condition, or proficiency. A todo requires a genuine purpose explaining why it matters; if Josiah has not provided one, ask rather than inventing it. When the user provides steps for a todo or routine, save them in the ordered checklist instead of creating unrelated records. Document evidence must cite an existing skill, resource, capability, activity, or mind node by its archived stable ID and record only what the named source supports. Mind nodes and relationships may be created only from Josiah's stated ideas or source material; never invent his identity, values, beliefs, confidence, or knowledge. Link existing Forge records through mind relationships instead of duplicating them as nodes. Ask before changing an existing record or archiving anything. Never edit archive files and never request deletion; archive records instead. Each request needs a new unique requestId. After writing a request, report the normalized name and fields submitted.\n`,
    );
    atomicWrite(
      join(this.options.driveDirectory, 'Forge Inbox Example.json'),
      JSON.stringify(
        {
          forgeInboxVersion: DRIVE_INBOX_VERSION,
          requestId: 'replace-with-a-new-unique-id',
          createdAt: new Date().toISOString(),
          summary: 'Explain the requested Forge changes',
          operations: [
            {
              operation: 'save',
              entityType: 'skill',
              record: {
                name: 'Example skill',
                category: 'General',
                knowledgeLevel: 0,
                practicalLevel: 0,
              },
            },
          ],
        },
        null,
        2,
      ),
    );
    atomicWrite(
      join(this.options.driveDirectory, 'Forge Mind Inbox Example.json'),
      JSON.stringify(
        {
          forgeInboxVersion: DRIVE_INBOX_VERSION,
          requestId: 'replace-with-a-new-unique-id',
          createdAt: new Date().toISOString(),
          summary: 'Add one stated concept and link it to an existing Forge record',
          operations: [
            {
              operation: 'save',
              entityType: 'mindNode',
              record: {
                id: 'choose-a-stable-node-id',
                title: 'Example concept',
                type: 'concept',
                description: 'Only record what the user actually stated.',
                notes: 'Preserve uncertainty and nuance here.',
                status: 'developing',
                confidence: 50,
                importance: 50,
              },
            },
            {
              operation: 'save',
              entityType: 'mindEdge',
              record: {
                source: { entityType: 'mindNode', entityId: 'choose-a-stable-node-id' },
                target: { entityType: 'skill', entityId: 'use-an-id-from-forge-archive' },
                relationshipType: 'related to',
                notes: 'Explain the stated connection.',
              },
            },
          ],
        },
        null,
        2,
      ),
    );
  }

  writeSnapshot() {
    const archive = createDriveArchive(
      this.options.username,
      this.options.store.archiveRecords(this.accountId),
    );
    const stable = JSON.stringify({ ...archive, generatedAt: undefined });
    const hash = createHash('sha256').update(stable).digest('hex');
    if (
      hash === this.lastArchiveHash &&
      existsSync(join(this.options.driveDirectory, 'Forge Archive.json'))
    )
      return false;
    this.lastArchiveHash = hash;
    const json = JSON.stringify(archive, null, 2);
    atomicWrite(join(this.options.driveDirectory, 'Forge Archive.json'), json);
    const stamp = archive.generatedAt.replaceAll(':', '-');
    atomicWrite(join(this.options.driveDirectory, 'Backups', `forge-archive-${stamp}.json`), json);
    for (const [name, contents] of Object.entries(archiveCsvFiles(archive)))
      atomicWrite(join(this.options.driveDirectory, 'Excel', name), contents);
    for (const attachment of this.options.store
      .archiveRecords(this.accountId, ['attachment'])
      .filter((record) => !record.deleted && typeof record.payload?.dataUrl === 'string')) {
      const dataUrl = String(attachment.payload?.dataUrl);
      const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
      if (!match) continue;
      const extension =
        match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
      writeFileSync(
        join(this.options.driveDirectory, 'Evidence', `${attachment.recordId}.${extension}`),
        Buffer.from(match[2]!, 'base64'),
      );
    }
    return true;
  }

  processInbox() {
    const inbox = join(this.options.driveDirectory, 'Inbox');
    const results: Array<{ file: string; status: string }> = [];
    for (const name of readdirSync(inbox).filter((item) =>
      /^forge-request-.+\.json$/i.test(item),
    )) {
      const source = join(inbox, name);
      try {
        if (statSync(source).size > 1_000_000) throw new Error('Inbox request exceeds 1 MB.');
        const parsed = driveInboxRequestSchema.parse(
          JSON.parse(readFileSync(source, 'utf8')) as unknown,
        );
        const previous = this.options.store.driveInboxReceipt(this.accountId, parsed.requestId);
        if (previous) {
          renameSync(
            source,
            join(
              this.options.driveDirectory,
              'Processed',
              `duplicate-${Date.now()}-${basename(name)}`,
            ),
          );
          results.push({ file: name, status: 'duplicate' });
          continue;
        }
        const changes = buildChanges(this.options.store, this.accountId, parsed);
        const sync = this.options.store.push(this.accountId, changes);
        const result = {
          requestId: parsed.requestId,
          summary: parsed.summary,
          saved: changes.map((item) => ({ entityType: item.entityType, recordId: item.recordId })),
          sync,
        };
        this.options.store.recordDriveInboxReceipt(
          this.accountId,
          parsed.requestId,
          name,
          'processed',
          result,
        );
        this.options.store.recordAudit(this.accountId, {
          toolName: 'drive_inbox',
          operation: 'write',
          request: parsed,
          result,
        });
        atomicWrite(
          join(this.options.driveDirectory, 'Processed', `${parsed.requestId}.receipt.json`),
          JSON.stringify(result, null, 2),
        );
        renameSync(source, join(this.options.driveDirectory, 'Processed', name));
        results.push({ file: name, status: 'processed' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown inbox error.';
        atomicWrite(
          join(
            this.options.driveDirectory,
            'Rejected',
            `${Date.now()}-${basename(name)}.error.json`,
          ),
          JSON.stringify(
            { source: name, rejectedAt: new Date().toISOString(), error: message },
            null,
            2,
          ),
        );
        renameSync(
          source,
          join(this.options.driveDirectory, 'Rejected', `${Date.now()}-${basename(name)}`),
        );
        results.push({ file: name, status: 'rejected' });
      }
    }
    return results;
  }

  runOnce() {
    this.initialize();
    const inbox = this.processInbox();
    const snapshotChanged = this.writeSnapshot();
    return { inbox, snapshotChanged };
  }
}

export function startDriveBridge(options: DriveBridgeOptions, intervalMs = 10_000) {
  const bridge = new ForgeDriveBridge(options);
  const run = () => {
    try {
      bridge.runOnce();
    } catch (error) {
      console.error('Forge Drive bridge:', error);
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return { bridge, stop: () => clearInterval(timer) };
}
