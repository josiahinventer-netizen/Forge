import { db, SCHEMA_VERSION, type ForgeDatabase } from '../database/db';
import type {
  Capability,
  CapabilityResourceRequirement,
  CapabilitySkillRequirement,
  ExportBundle,
  EvidenceAttachment,
  Resource,
  Skill,
  Todo,
} from '../types/models';

declare const __APP_VERSION__: string;

export type ImportMode = 'merge' | 'replace';
export interface ImportResult {
  skills: number;
  resources: number;
  capabilities: number;
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
    ['resource', 'skill', 'capability'].includes(String(value.ownerType)) &&
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

export function isTodo(value: unknown): value is Todo {
  if (!isRecord(value) || !hasBaseRecord(value)) return false;
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
    (value.completedAt === undefined || isDate(value.completedAt))
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
  const todos = value.records.todos ?? [];
  if (!Array.isArray(skills) || !skills.every(isSkill)) errors.push('Skills contain invalid data.');
  if (!Array.isArray(resources) || !resources.every(isResource))
    errors.push('Resources contain invalid data.');
  if (!Array.isArray(capabilities) || !capabilities.every(isCapability))
    errors.push('Capabilities contain invalid data.');
  if (!Array.isArray(attachments) || !attachments.every(isAttachment))
    errors.push('Attachments contain invalid data.');
  if (!Array.isArray(todos) || !todos.every(isTodo)) errors.push('Todos contain invalid data.');
  if (errors.length) return { valid: false, errors };

  const bundle = value as unknown as ExportBundle;
  if (!hasUniqueIds(bundle.records.skills)) errors.push('Skills contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.resources)) errors.push('Resources contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.capabilities))
    errors.push('Capabilities contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.attachments ?? []))
    errors.push('Attachments contain duplicate IDs.');
  if (!hasUniqueIds(bundle.records.todos ?? [])) errors.push('Todos contain duplicate IDs.');
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
      database.todos,
    ],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          database.skills.clear(),
          database.resources.clear(),
          database.capabilities.clear(),
          database.attachments.clear(),
          database.todos.clear(),
        ]);
        await database.skills.bulkPut(bundle.records.skills);
        await database.resources.bulkPut(bundle.records.resources);
        await database.capabilities.bulkPut(bundle.records.capabilities);
        await database.attachments.bulkPut(bundle.records.attachments ?? []);
        await database.todos.bulkPut(bundle.records.todos ?? []);
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
      await database.todos.bulkPut(
        newerRecords(await database.todos.toArray(), bundle.records.todos ?? []),
      );
    },
  );
  return {
    skills: bundle.records.skills.length,
    resources: bundle.records.resources.length,
    capabilities: bundle.records.capabilities.length,
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
      todos: await database.todos.toArray(),
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
