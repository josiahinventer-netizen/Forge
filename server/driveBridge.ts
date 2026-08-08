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
export const ASSISTANT_CONTEXT_VERSION = 1;

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
      'has skill',
      'has credential',
      'interested in',
      'works on',
      'pursues',
      'wants to learn',
      'knows about',
      'practices',
      'experienced in',
      'responsible for',
      'supports goal',
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
    execution: z
      .object({
        workState: z.enum(['actionable', 'waiting', 'blocked', 'scheduled', 'deferred', 'someday']),
        nextAction: z.string().optional(),
        waitingOn: z.string().optional(),
        waitingCondition: z.string().optional(),
        blockedReason: z.string().optional(),
        blockedBy: z.array(graphEntityReference).optional(),
        reviewAt: z.string().datetime().optional(),
        availableAfter: z.string().datetime().optional(),
        deadlineKind: z.enum(['hard', 'target']).optional(),
        urgencyReason: z.string().optional(),
        contexts: z.array(z.string()).optional(),
      })
      .optional(),
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
    execution: { workState: 'actionable', blockedBy: [], contexts: [] },
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

type ArchivePayload = Record<string, unknown>;

const activePayloads = (items: Array<ArchivePayload | null>) =>
  items.filter((item): item is ArchivePayload => Boolean(item) && item?.archived !== true);

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const number = (value: unknown) => (typeof value === 'number' ? value : 0);

const compactMindNode = (item: ArchivePayload) => ({
  id: text(item.id),
  title: text(item.title),
  type: text(item.type),
  status: text(item.status),
  description: text(item.description),
  confidence: number(item.confidence),
  importance: number(item.importance),
  ...(item.familiarityLevel === undefined ? {} : { familiarityLevel: item.familiarityLevel }),
  ...(item.practicalLevel === undefined ? {} : { practicalLevel: item.practicalLevel }),
  ...(item.lastReviewedAt === undefined ? {} : { lastReviewedAt: item.lastReviewedAt }),
});

const byImportance = (left: ArchivePayload, right: ArchivePayload) =>
  number(right.importance) - number(left.importance) ||
  text(left.title).localeCompare(text(right.title));

export function createAssistantContext(archive: ReturnType<typeof createDriveArchive>) {
  const mindNodes = activePayloads(archive.records.mindNodes);
  const mindEdges = activePayloads(archive.records.mindEdges);
  const skills = activePayloads(archive.records.skills);
  const todos = activePayloads(archive.records.todos).filter(
    (item) => text(item.status) !== 'Completed',
  );
  const activities = activePayloads(archive.records.activities);
  const nodesOfType = (type: string, limit = 20) =>
    mindNodes
      .filter((item) => item.type === type)
      .sort(byImportance)
      .slice(0, limit)
      .map(compactMindNode);
  const compactTodos = todos
    .sort((left, right) => {
      const priority = { Urgent: 4, High: 3, Normal: 2, Low: 1 } as Record<string, number>;
      return (
        (priority[text(right.priority)] ?? 0) - (priority[text(left.priority)] ?? 0) ||
        text(left.dueAt).localeCompare(text(right.dueAt))
      );
    })
    .slice(0, 30)
    .map((item) => ({
      id: text(item.id),
      title: text(item.title),
      purpose: text(item.purpose),
      status: text(item.status),
      priority: text(item.priority),
      ...(item.scheduledFor === undefined ? {} : { scheduledFor: item.scheduledFor }),
      ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
      ...(item.estimatedMinutes === undefined ? {} : { estimatedMinutes: item.estimatedMinutes }),
      ...(item.execution === undefined ? {} : { execution: item.execution }),
    }));
  const todoById = new Map(todos.map((item) => [text(item.id), item]));
  const nodeById = new Map(mindNodes.map((item) => [text(item.id), item]));
  const currentFocus = mindNodes
    .filter(
      (item) =>
        ['goal', 'project'].includes(text(item.type)) &&
        Array.isArray(item.tags) &&
        item.tags.some((tag) => String(tag).toLowerCase() === 'current-focus'),
    )
    .map(compactMindNode);
  const reachFromTodo = (todoId: string) => {
    const queue = [`todo:${todoId}`];
    const seen = new Set(queue);
    const labels: string[] = [];
    const focusLabels: string[] = [];
    const useful = new Set([
      'supports',
      'supports goal',
      'contributes to',
      'part of',
      'motivated by',
    ]);
    for (let depth = 0; depth < 4 && queue.length; depth += 1) {
      for (const current of queue.splice(0)) {
        for (const edge of mindEdges) {
          const source = edge.source as ArchivePayload | undefined;
          const target = edge.target as ArchivePayload | undefined;
          if (
            !useful.has(text(edge.relationshipType)) ||
            `${text(source?.entityType)}:${text(source?.entityId)}` !== current
          )
            continue;
          const targetKey = `${text(target?.entityType)}:${text(target?.entityId)}`;
          if (seen.has(targetKey)) continue;
          seen.add(targetKey);
          queue.push(targetKey);
          if (target?.entityType === 'mindNode') {
            const node = nodeById.get(text(target.entityId));
            if (node) {
              labels.push(text(node.title));
              if (
                Array.isArray(node.tags) &&
                node.tags.some((tag) => String(tag).toLowerCase() === 'current-focus')
              )
                focusLabels.push(text(node.title));
            }
          }
        }
      }
    }
    return { labels: [...new Set(labels)], focusLabels: [...new Set(focusLabels)] };
  };
  const contextNow = Date.parse(archive.generatedAt);
  const stateOf = (item: ArchivePayload) =>
    text((item.execution as ArchivePayload | undefined)?.workState) || 'actionable';
  const waitingItems = compactTodos.filter((item) => stateOf(todoById.get(item.id)!) === 'waiting');
  const blockedItems = compactTodos.filter((item) => stateOf(todoById.get(item.id)!) === 'blocked');
  const upcomingDeadlines = compactTodos
    .filter((item) => item.dueAt)
    .map((item) => ({
      ...item,
      daysRemaining: Math.ceil((Date.parse(String(item.dueAt)) - contextNow) / 86_400_000),
    }))
    .sort((left, right) => left.daysRemaining - right.daysRemaining)
    .slice(0, 15);
  const actionableNow = compactTodos
    .filter((item) => {
      const source = todoById.get(item.id)!;
      const execution = source.execution as ArchivePayload | undefined;
      const available = text(execution?.availableAfter) || text(source.scheduledFor);
      return (
        stateOf(source) === 'actionable' && (!available || Date.parse(available) <= contextNow)
      );
    })
    .map((item) => {
      const source = todoById.get(item.id)!;
      const execution = source.execution as ArchivePayload | undefined;
      const reach = reachFromTodo(item.id);
      const daysRemaining = item.dueAt
        ? Math.ceil((Date.parse(String(item.dueAt)) - contextNow) / 86_400_000)
        : undefined;
      const reasons = [
        ...(daysRemaining !== undefined && daysRemaining <= 7
          ? [daysRemaining < 0 ? 'past deadline' : `deadline in ${daysRemaining} days`]
          : []),
        ...(reach.focusLabels.length
          ? [`supports current focus: ${reach.focusLabels.join(', ')}`]
          : []),
        ...(reach.labels.length ? [`advances ${reach.labels.slice(0, 3).join(', ')}`] : []),
        ...(text(execution?.urgencyReason) ? [text(execution?.urgencyReason)] : []),
      ];
      const score =
        ({ Urgent: 35, High: 20, Normal: 10, Low: 0 }[item.priority as string] ?? 0) +
        (daysRemaining === undefined
          ? 0
          : daysRemaining < 0
            ? 100
            : daysRemaining <= 1
              ? 80
              : daysRemaining <= 3
                ? 55
                : daysRemaining <= 7
                  ? 30
                  : 0) +
        (reach.focusLabels.length ? 40 : 0) +
        Math.min(reach.labels.length, 4) * 8;
      return { ...item, score, reasons, unlocks: reach.labels };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
  const compactSkills = skills
    .sort(
      (left, right) =>
        number(right.practicalLevel) +
          number(right.knowledgeLevel) -
          number(left.practicalLevel) -
          number(left.knowledgeLevel) || text(left.name).localeCompare(text(right.name)),
    )
    .slice(0, 30)
    .map((item) => ({
      id: text(item.id),
      name: text(item.name),
      category: text(item.category),
      knowledgeLevel: number(item.knowledgeLevel),
      practicalLevel: number(item.practicalLevel),
      confidence: number(item.confidence),
    }));
  const recentActivities = activities
    .sort((left, right) => text(right.occurredAt).localeCompare(text(left.occurredAt)))
    .slice(0, 10)
    .map((item) => ({
      id: text(item.id),
      title: text(item.title),
      purpose: text(item.purpose),
      occurredAt: text(item.occurredAt),
      outcome: text(item.outcome),
    }));
  const weekStart = Date.parse(archive.generatedAt) - 7 * 86_400_000;
  const progressSummary = {
    completedTodos: activePayloads(archive.records.todoOccurrences)
      .filter((item) => Date.parse(text(item.completedAt)) >= weekStart)
      .slice(0, 15)
      .map((item) => ({
        id: text(item.id),
        title: text(item.title),
        purpose: text(item.purpose),
        completedAt: text(item.completedAt),
      })),
    activities: recentActivities.filter((item) => Date.parse(item.occurredAt) >= weekStart),
  };
  const importantRelationships = mindEdges
    .filter((item) => {
      const source = item.source as ArchivePayload | undefined;
      const target = item.target as ArchivePayload | undefined;
      return Boolean(source?.entityId && target?.entityId);
    })
    .slice(0, 60)
    .map((item) => ({
      id: text(item.id),
      source: item.source,
      relationshipType: text(item.relationshipType),
      ...(item.customRelationship === undefined
        ? {}
        : { customRelationship: item.customRelationship }),
      target: item.target,
      notes: text(item.notes),
    }));
  return {
    forgeAssistantContextVersion: ASSISTANT_CONTEXT_VERSION,
    generatedAt: archive.generatedAt,
    source: {
      forgeArchiveVersion: archive.forgeArchiveVersion,
      username: archive.username,
      authoritativeFile: 'Forge Archive.json',
      derived: true,
    },
    counts: {
      activeMindNodes: mindNodes.length,
      activeMindRelationships: mindEdges.length,
      activeSkills: skills.length,
      openTodos: todos.length,
      recentActivitiesIncluded: recentActivities.length,
    },
    identity: nodesOfType('identity'),
    values: nodesOfType('value'),
    beliefs: nodesOfType('belief'),
    principles: nodesOfType('principle'),
    currentFocus,
    activeGoals: nodesOfType('goal'),
    activeProjects: nodesOfType('project'),
    interests: nodesOfType('interest'),
    habits: nodesOfType('habit'),
    openQuestions: nodesOfType('question'),
    knowledge: nodesOfType('knowledge', 30),
    activeTodos: compactTodos,
    actionableNow,
    waitingItems,
    blockedItems,
    upcomingDeadlines,
    importantBottlenecks: actionableNow.filter((item) => item.unlocks.length > 0).slice(0, 5),
    relevantSkills: compactSkills,
    recentActivities,
    progressSummary,
    importantRelationships,
    projectionLimits: {
      mindNodesPerSection: 20,
      knowledgeNodes: 30,
      todos: 30,
      skills: 30,
      activities: 10,
      relationships: 60,
      note: 'Read Forge Archive.json when a question needs records omitted from this compact projection.',
    },
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
        'workState',
        'nextAction',
        'waitingOn',
        'waitingCondition',
        'blockedReason',
        'reviewAt',
        'availableAfter',
        'deadlineKind',
        'urgencyReason',
        'contexts',
        'blockedBy',
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
        (item?.execution as Record<string, unknown> | undefined)?.workState,
        (item?.execution as Record<string, unknown> | undefined)?.nextAction,
        (item?.execution as Record<string, unknown> | undefined)?.waitingOn,
        (item?.execution as Record<string, unknown> | undefined)?.waitingCondition,
        (item?.execution as Record<string, unknown> | undefined)?.blockedReason,
        (item?.execution as Record<string, unknown> | undefined)?.reviewAt,
        (item?.execution as Record<string, unknown> | undefined)?.availableAfter,
        (item?.execution as Record<string, unknown> | undefined)?.deadlineKind,
        (item?.execution as Record<string, unknown> | undefined)?.urgencyReason,
        JSON.stringify((item?.execution as Record<string, unknown> | undefined)?.contexts ?? []),
        JSON.stringify((item?.execution as Record<string, unknown> | undefined)?.blockedBy ?? []),
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
    if (item.entityType === 'todo') {
      const execution = (recordFields.execution ?? {}) as Record<string, unknown>;
      recordFields.execution = {
        workState: execution.workState ?? 'actionable',
        ...execution,
        blockedBy: execution.blockedBy ?? [],
        contexts: execution.contexts ?? [],
      };
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
  for (const change of changes.filter((item) => item.entityType === 'todo')) {
    const execution = change.payload?.execution as Record<string, unknown> | undefined;
    for (const blocker of (execution?.blockedBy ?? []) as Array<{
      entityType: string;
      entityId: string;
    }>) {
      const blockerRecord = current.get(`${blocker.entityType}:${blocker.entityId}`);
      if (!blockerRecord || blockerRecord.payload?.archived === true)
        throw new Error(
          `Todo blocker ${blocker.entityType}:${blocker.entityId} is missing or archived.`,
        );
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
      `# Conversational Forge instructions

Forge is Josiah's durable source of truth. Read **Forge Assistant Context.json** first for ordinary questions and **Forge Archive.json** when exact, archived, or omitted records are needed. The assistant context is derived and must never be edited as data.

## Conversation patterns

- **“Forge this”**: if the statement explicitly and unambiguously creates non-destructive information, check for duplicates, reuse existing record IDs, and create one \`forge-request-<unique-id>.json\` in **Inbox**. Do not ask for redundant confirmation.
- **“Let's forge this through a discussion”**: interview thoughtfully, test examples and tradeoffs, distinguish Josiah's statements from possible interpretations, and do not write speculative conclusions.
- **“Forge what we learned” / “Save what we figured out”**: extract only durable conclusions supported or confirmed in the current conversation. Prefer a few useful nodes and relationships over a transcript or many near-duplicates.
- **“What should I do today?”**: use active todos, purpose, priority, timing, goals/projects, recent activity, and graph relationships. Explain why. Ask at most the small amount of missing context that materially changes the answer. Do not modify records unless asked.
- **“What should I learn next?”**: use goals, interests, skills, knowledge, questions, and prerequisite relationships. Explain the evidence and gaps; do not claim mastery because something was explained once.
- **“What do you know about me?”**: ground every claim in Forge and distinguish recorded, developing, uncertain, and archived information. Do not infer personality from weak evidence.
- **“Update this in Forge”**: show the exact existing record and proposed change, then require explicit confirmation before writing.
- **“Archive X”**: an explicit command naming the exact record authorizes archiving it; otherwise clarify. Never delete.

## Safety and write protocol

Never invent identity, values, beliefs, principles, experience, proficiency, quantities, condition, or understanding. Preserve uncertainty in status, confidence, description, and notes. A candidate interpretation from discussion is not a Forge record until Josiah states or confirms it. Do not mechanically save every conversational statement. Do not create duplicate Mind nodes for existing skills, resources, capabilities, todos, or activities; link them with Mind relationships. A todo needs a genuine stated purpose. Document evidence must cite an existing stable ID and only what its source supports.

Represent execution separately from todo lifecycle status. Use \`execution.workState\` only when Josiah explicitly states it or a date makes availability deterministic: \`actionable\`, \`waiting\`, \`blocked\`, \`scheduled\`, \`deferred\`, or \`someday\`. For waiting work, record \`waitingOn\`, the condition that would make it actionable, and an optional \`reviewAt\`. For blocked work, record a plain \`blockedReason\` and stable \`blockedBy\` references when the blocker exists in Forge. Record a concrete \`nextAction\`; use \`deadlineKind: "hard"\` only for a genuinely consequential deadline and preserve the consequence in \`urgencyReason\`. Mark a goal or project as current focus with the exact tag \`current-focus\` only when Josiah explicitly chooses it. Possible opportunities or decisions remain Mind questions/projects until their facts justify a richer record; do not manufacture a decision or next action.

Never edit **Forge Archive.json** or **Forge Assistant Context.json**. Use **Forge Inbox Example.json** or **Forge Mind Inbox Example.json**, a new unique requestId, and only \`save\` operations. Ask before changing an existing record unless Josiah has just explicitly approved the exact proposed change. After writing a request, report what was normalized and saved, then verify it appears in the refreshed archive/context or a Processed receipt.
`,
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
    atomicWrite(
      join(this.options.driveDirectory, 'Forge Execution Inbox Example.json'),
      JSON.stringify(
        {
          forgeInboxVersion: DRIVE_INBOX_VERSION,
          requestId: 'replace-with-a-new-unique-id',
          createdAt: new Date().toISOString(),
          summary: 'Record an explicitly stated execution state',
          operations: [
            {
              operation: 'save',
              entityType: 'todo',
              record: {
                title: 'Example waiting item',
                purpose: 'Explain the real outcome this supports.',
                priority: 'Normal',
                execution: {
                  workState: 'waiting',
                  nextAction: 'Check for a response after the review date.',
                  waitingOn: 'Name the external person or condition the user stated.',
                  waitingCondition: 'A response arrives.',
                  reviewAt: '2026-08-15T16:00:00.000Z',
                  blockedBy: [],
                  contexts: ['phone'],
                },
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
    atomicWrite(
      join(this.options.driveDirectory, 'Forge Assistant Context.json'),
      JSON.stringify(createAssistantContext(archive), null, 2),
    );
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
