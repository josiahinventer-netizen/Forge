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
const capabilityOperation = z.object({
  operation: z.literal('save'),
  entityType: z.literal('capability'),
  record: z.object({
    ...baseFields,
    requiredSkills: z.array(skillRequirement).optional(),
    requiredResources: z.array(resourceRequirement).optional(),
  }),
});
export const driveInboxRequestSchema = z.object({
  forgeInboxVersion: z.literal(DRIVE_INBOX_VERSION),
  requestId: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  summary: z.string().min(1).max(500),
  operations: z
    .array(z.union([skillOperation, resourceOperation, capabilityOperation]))
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
  capability: { description: '', category: 'General', requiredSkills: [], requiredResources: [] },
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
    return {
      entityType: item.entityType,
      recordId: id,
      updatedAt: timestamp,
      deleted: false,
      payload: record,
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
      `# Forge archive instructions\n\nRead **Forge Archive.json** before changing Forge. When Josiah clearly says to add or log something in Forge, that statement authorizes one non-destructive create request: correct obvious spelling and capitalization, check the archive for duplicates, infer only conservative defaults, and immediately create one file named \`forge-request-<unique-id>.json\` in **Inbox** using **Forge Inbox Example.json** as the schema. Do not ask for a second confirmation unless the intended record type or identity is genuinely ambiguous. Preserve uncertainty in notes instead of inventing experience, quantities, condition, or proficiency. Ask before changing an existing record or archiving anything. Never edit archive files and never request deletion; archive records instead. Each request needs a new unique requestId. After writing a request, report the normalized name and fields submitted.\n`,
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
