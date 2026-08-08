import Dexie, { type EntityTable } from 'dexie';
import type {
  Capability,
  Activity,
  EvidenceAttachment,
  DocumentEvidence,
  Resource,
  Skill,
  SyncSettings,
  Todo,
  TodoOccurrence,
  ReminderEvent,
  MindNode,
  MindEdge,
} from '../types/models';

export const SCHEMA_VERSION = 14;

export class ForgeDatabase extends Dexie {
  skills!: EntityTable<Skill, 'id'>;
  resources!: EntityTable<Resource, 'id'>;
  capabilities!: EntityTable<Capability, 'id'>;
  syncSettings!: EntityTable<SyncSettings, 'id'>;
  attachments!: EntityTable<EvidenceAttachment, 'id'>;
  documentEvidence!: EntityTable<DocumentEvidence, 'id'>;
  todos!: EntityTable<Todo, 'id'>;
  activities!: EntityTable<Activity, 'id'>;
  todoOccurrences!: EntityTable<TodoOccurrence, 'id'>;
  reminderEvents!: EntityTable<ReminderEvent, 'id'>;
  mindNodes!: EntityTable<MindNode, 'id'>;
  mindEdges!: EntityTable<MindEdge, 'id'>;

  constructor(name = 'forge') {
    super(name);

    // Initial vertical-slice schema. Retained so databases created by early builds upgrade safely.
    this.version(1).stores({
      skills: 'id, name, category, archived, updatedAt',
      resources: 'id, name, category, resourceType, archived, updatedAt',
      capabilities: 'id, name, category, status, archived, updatedAt',
      actions: 'id, title, category, status, completedAt, archived, updatedAt',
      knowledgeEntries: 'id, title, category, verificationStatus, archived, updatedAt',
      profiles: 'id',
    });

    // V2 narrows the application to the first vertical slice and normalizes legacy records.
    this.version(2)
      .stores({
        skills: 'id, name, category, archived, updatedAt, *tags',
        resources: 'id, name, category, resourceType, archived, updatedAt, *tags',
        capabilities: null,
        actions: null,
        knowledgeEntries: null,
        profiles: null,
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Skill>('skills')
          .toCollection()
          .modify((skill) => {
            skill.tags ??= [];
            skill.archived ??= false;
            skill.confidence ??= 50;
            skill.evidenceNotes ??= '';
            skill.evidenceLinks ??= [];
          });
        await transaction
          .table<Resource>('resources')
          .toCollection()
          .modify((resource) => {
            resource.tags ??= [];
            resource.archived ??= false;
            resource.notes ??= '';
          });
      });

    // V3 adds capabilities as references to existing skills and resources.
    this.version(3).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources: 'id, name, category, resourceType, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
    });

    // V4 stores device-local sync connection state without changing personal records.
    this.version(4).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources: 'id, name, category, resourceType, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
      syncSettings: 'id',
    });

    // V5 adds explainable resource intelligence without removing legacy fields.
    this.version(5)
      .stores({
        skills: 'id, name, category, archived, updatedAt, *tags',
        resources:
          'id, name, category, resourceType, resourceClass, verificationStatus, archived, updatedAt, *tags',
        capabilities: 'id, name, category, archived, updatedAt, *tags',
        syncSettings: 'id',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Resource>('resources')
          .toCollection()
          .modify((resource) => {
            resource.resourceClass ??=
              resource.resourceType === 'Material' ? 'Consumable' : 'Durable asset';
            resource.manufacturer ??= '';
            resource.model ??= '';
            resource.serialNumber ??= '';
            resource.currency ??= 'USD';
            resource.verificationStatus ??= 'Confirmed';
            resource.evidenceNotes ??= '';
            resource.photoDataUrls ??= [];
          });
      });

    // V6 stores bounded image evidence as independently synchronized records.
    this.version(6).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources:
        'id, name, category, resourceType, resourceClass, verificationStatus, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
      attachments: 'id, ownerType, ownerId, kind, verificationStatus, archived, updatedAt, sha256',
      syncSettings: 'id',
    });

    // V7 adds purpose-aware scheduled todos without changing existing records.
    this.version(7).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources:
        'id, name, category, resourceType, resourceClass, verificationStatus, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
      attachments: 'id, ownerType, ownerId, kind, verificationStatus, archived, updatedAt, sha256',
      todos: 'id, title, status, priority, scheduledFor, dueAt, archived, updatedAt, *tags',
      syncSettings: 'id',
    });

    // V8 adds an evidence ledger. Activities reference existing records and never alter levels.
    this.version(8).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources:
        'id, name, category, resourceType, resourceClass, verificationStatus, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
      attachments: 'id, ownerType, ownerId, kind, verificationStatus, archived, updatedAt, sha256',
      todos: 'id, title, status, priority, scheduledFor, dueAt, archived, updatedAt, *tags',
      activities: 'id, title, occurredAt, archived, updatedAt, *tags',
      syncSettings: 'id',
    });

    // V9 preserves each recurring completion while keeping the parent todo stable.
    this.version(9).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources:
        'id, name, category, resourceType, resourceClass, verificationStatus, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
      attachments: 'id, ownerType, ownerId, kind, verificationStatus, archived, updatedAt, sha256',
      todos: 'id, title, status, priority, scheduledFor, dueAt, archived, updatedAt, *tags',
      todoOccurrences: 'id, todoId, completedAt, archived, updatedAt, *tags',
      activities: 'id, title, occurredAt, archived, updatedAt, *tags',
      syncSettings: 'id',
    });

    // V10 expands the existing attachment relation to activity evidence without rewriting data.
    this.version(10).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources:
        'id, name, category, resourceType, resourceClass, verificationStatus, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
      attachments: 'id, ownerType, ownerId, kind, verificationStatus, archived, updatedAt, sha256',
      todos: 'id, title, status, priority, scheduledFor, dueAt, archived, updatedAt, *tags',
      todoOccurrences: 'id, todoId, completedAt, archived, updatedAt, *tags',
      activities: 'id, title, occurredAt, archived, updatedAt, *tags',
      syncSettings: 'id',
    });

    // V11 persists reminder detection and user actions so missed reminders remain recoverable.
    this.version(11).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources:
        'id, name, category, resourceType, resourceClass, verificationStatus, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
      attachments: 'id, ownerType, ownerId, kind, verificationStatus, archived, updatedAt, sha256',
      todos: 'id, title, status, priority, scheduledFor, dueAt, archived, updatedAt, *tags',
      todoOccurrences: 'id, todoId, completedAt, archived, updatedAt, *tags',
      reminderEvents:
        'id, todoId, occurrenceKey, detectedAt, acknowledgedAt, action, archived, updatedAt',
      activities: 'id, title, occurredAt, archived, updatedAt, *tags',
      syncSettings: 'id',
    });

    // V12 adds ordered checklist steps and preserves completed recurring snapshots.
    this.version(12)
      .stores({
        skills: 'id, name, category, archived, updatedAt, *tags',
        resources:
          'id, name, category, resourceType, resourceClass, verificationStatus, archived, updatedAt, *tags',
        capabilities: 'id, name, category, archived, updatedAt, *tags',
        attachments:
          'id, ownerType, ownerId, kind, verificationStatus, archived, updatedAt, sha256',
        todos: 'id, title, status, priority, scheduledFor, dueAt, archived, updatedAt, *tags',
        todoOccurrences: 'id, todoId, completedAt, archived, updatedAt, *tags',
        reminderEvents:
          'id, todoId, occurrenceKey, detectedAt, acknowledgedAt, action, archived, updatedAt',
        activities: 'id, title, occurredAt, archived, updatedAt, *tags',
        syncSettings: 'id',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Todo>('todos')
          .toCollection()
          .modify((todo) => {
            todo.checklist ??= [];
          });
        await transaction
          .table<TodoOccurrence>('todoOccurrences')
          .toCollection()
          .modify((occurrence) => {
            occurrence.checklist ??= [];
          });
      });

    // V13 adds attributed non-image evidence linked to existing records by stable IDs.
    this.version(13).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources:
        'id, name, category, resourceType, resourceClass, verificationStatus, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
      attachments: 'id, ownerType, ownerId, kind, verificationStatus, archived, updatedAt, sha256',
      documentEvidence:
        'id, ownerType, ownerId, sourceType, verificationStatus, issuedAt, archived, updatedAt, *tags',
      todos: 'id, title, status, priority, scheduledFor, dueAt, archived, updatedAt, *tags',
      todoOccurrences: 'id, todoId, completedAt, archived, updatedAt, *tags',
      reminderEvents:
        'id, todoId, occurrenceKey, detectedAt, acknowledgedAt, action, archived, updatedAt',
      activities: 'id, title, occurredAt, archived, updatedAt, *tags',
      syncSettings: 'id',
    });

    // V14 adds semantic mind-graph nodes and first-class edges without changing existing records.
    this.version(14).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources:
        'id, name, category, resourceType, resourceClass, verificationStatus, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
      attachments: 'id, ownerType, ownerId, kind, verificationStatus, archived, updatedAt, sha256',
      documentEvidence:
        'id, ownerType, ownerId, sourceType, verificationStatus, issuedAt, archived, updatedAt, *tags',
      mindNodes: 'id, title, type, status, importance, archived, updatedAt, *tags',
      mindEdges:
        'id, source.entityId, target.entityId, relationshipType, archived, updatedAt, *tags',
      todos: 'id, title, status, priority, scheduledFor, dueAt, archived, updatedAt, *tags',
      todoOccurrences: 'id, todoId, completedAt, archived, updatedAt, *tags',
      reminderEvents:
        'id, todoId, occurrenceKey, detectedAt, acknowledgedAt, action, archived, updatedAt',
      activities: 'id, title, occurredAt, archived, updatedAt, *tags',
      syncSettings: 'id',
    });
  }
}

export const db = new ForgeDatabase();
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const baseRecord = () => ({
  id: uid(),
  createdAt: now(),
  updatedAt: now(),
  tags: [] as string[],
  archived: false,
});
