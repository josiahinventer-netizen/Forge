import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ForgeSyncStore } from './store.js';
import { forgeDatabasePath } from './paths.js';
import type { ArchiveRecord, SyncEntityType } from './types.js';

const username = process.env.FORGE_MCP_USERNAME;
if (!username) throw new Error('FORGE_MCP_USERNAME is required.');

const store = new ForgeSyncStore(forgeDatabasePath);
const accountId = store.accountIdForUsername(username);
if (!accountId) throw new Error(`Forge account ${username} was not found.`);
const forgeAccountId = accountId;
const writesEnabled = process.env.FORGE_MCP_WRITE === 'enabled';

const mcp = new McpServer({ name: 'forge-local-archive', version: '1.0.0' });
const textResult = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});
const payloadOf = (record: ArchiveRecord | null) => record?.payload ?? null;
const isArchived = (payload: Record<string, unknown> | null) => payload?.archived === true;

const audit = (
  toolName: string,
  operation: 'read' | 'write',
  request: unknown,
  result: unknown,
  entityType?: SyncEntityType,
  recordId?: string,
) =>
  store.recordAudit(forgeAccountId, {
    toolName,
    operation,
    request,
    result,
    entityType,
    recordId,
  });

mcp.registerTool(
  'forge_overview',
  {
    description:
      'Summarize the user-owned Forge archive. Use this before recommendations so claims are grounded in current data.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    const records = store.archiveRecords(forgeAccountId).filter((record) => !record.deleted);
    const result = {
      username,
      skills: records.filter(
        (record) => record.entityType === 'skill' && !isArchived(record.payload),
      ).length,
      resources: records.filter(
        (record) => record.entityType === 'resource' && !isArchived(record.payload),
      ).length,
      capabilities: records.filter(
        (record) => record.entityType === 'capability' && !isArchived(record.payload),
      ).length,
      archived: records.filter((record) => isArchived(record.payload)).length,
      aiAuditEntries: store.auditCount(forgeAccountId),
    };
    audit('forge_overview', 'read', {}, result);
    return textResult(result);
  },
);

mcp.registerTool(
  'forge_search',
  {
    description:
      'Search skills, resources, and capabilities in Forge by name, description, category, or tags. Returns current source records, not inferred claims.',
    inputSchema: {
      query: z.string().default(''),
      entityTypes: z
        .array(z.enum(['skill', 'resource', 'capability']))
        .default(['skill', 'resource', 'capability']),
      includeArchived: z.boolean().default(false),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (input) => {
    const needle = input.query.trim().toLowerCase();
    const matches = store
      .archiveRecords(forgeAccountId, input.entityTypes)
      .filter((record) => !record.deleted && (input.includeArchived || !isArchived(record.payload)))
      .filter((record) => !needle || JSON.stringify(record.payload).toLowerCase().includes(needle))
      .slice(0, 100);
    const result = matches.map((record) => ({
      entityType: record.entityType,
      recordId: record.recordId,
      ...record.payload,
    }));
    audit('forge_search', 'read', input, { matchCount: result.length });
    return textResult(result);
  },
);

mcp.registerTool(
  'forge_get_record',
  {
    description: 'Get one exact Forge source record by its stable ID and entity type.',
    inputSchema: {
      entityType: z.enum(['skill', 'resource', 'capability']),
      recordId: z.string().min(1),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (input) => {
    const result = store.archiveRecord(forgeAccountId, input.entityType, input.recordId);
    audit(
      'forge_get_record',
      'read',
      input,
      { found: Boolean(result) },
      input.entityType,
      input.recordId,
    );
    return textResult(result);
  },
);

const commonFields = {
  id: z
    .string()
    .min(1)
    .optional()
    .describe('Existing stable ID when updating; omit when creating.'),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  archived: z.boolean().optional(),
  confirm: z
    .literal(true)
    .describe('Set true only after the user explicitly confirms this exact write.'),
};

async function saveRecord(
  toolName: string,
  entityType: SyncEntityType,
  input: Record<string, unknown> & { id?: string; confirm: true },
  defaults: Record<string, unknown>,
) {
  if (!writesEnabled) throw new Error('Forge MCP write tools are disabled.');
  const existing = input.id
    ? payloadOf(store.archiveRecord(forgeAccountId, entityType, input.id))
    : null;
  if (!existing && typeof input.name !== 'string')
    throw new Error('Name is required when creating.');
  const timestamp = new Date().toISOString();
  const id = input.id ?? randomUUID();
  const { confirm: _confirmed, id: _inputId, ...changes } = input;
  void _confirmed;
  void _inputId;
  const record = {
    ...defaults,
    ...(existing ?? {}),
    ...changes,
    id,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    tags: changes.tags ?? existing?.tags ?? [],
    archived: changes.archived ?? existing?.archived ?? false,
  };
  const result = store.push(forgeAccountId, [
    {
      entityType,
      recordId: id,
      updatedAt: timestamp,
      deleted: false,
      payload: record,
    },
  ]);
  audit(toolName, 'write', { ...input, confirm: true }, { record, sync: result }, entityType, id);
  return textResult({ saved: true, entityType, record });
}

mcp.registerTool(
  'forge_save_skill',
  {
    description:
      'Create or update a Forge skill after explicit user confirmation. Keep knowledge and practical levels separate and make conservative evidence-based claims.',
    inputSchema: {
      ...commonFields,
      knowledgeLevel: z.number().int().min(0).max(5).optional(),
      practicalLevel: z.number().int().min(0).max(5).optional(),
      confidence: z.number().min(0).max(100).optional(),
      evidenceNotes: z.string().optional(),
      evidenceLinks: z.array(z.string()).optional(),
      lastUsedAt: z.string().datetime().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (input) =>
    saveRecord('forge_save_skill', 'skill', input, {
      description: '',
      category: 'General',
      knowledgeLevel: 0,
      practicalLevel: 0,
      confidence: 50,
      evidenceNotes: '',
      evidenceLinks: [],
    }),
);

mcp.registerTool(
  'forge_save_resource',
  {
    description:
      'Create or update a Forge resource after explicit user confirmation. Resources are real tools, materials, equipment, software, property, or other available assets.',
    inputSchema: {
      ...commonFields,
      resourceType: z.string().optional(),
      quantity: z.number().min(0).optional(),
      unit: z.string().optional(),
      condition: z.string().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (input) =>
    saveRecord('forge_save_resource', 'resource', input, {
      description: '',
      category: 'General',
      resourceType: 'Other',
      quantity: 1,
      unit: 'item',
      condition: '',
      location: '',
      notes: '',
    }),
);

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

mcp.registerTool(
  'forge_save_capability',
  {
    description:
      'Create or update a Forge capability after explicit user confirmation. Requirements must reference existing Forge skill and resource IDs rather than duplicate them.',
    inputSchema: {
      ...commonFields,
      requiredSkills: z.array(skillRequirement).optional(),
      requiredResources: z.array(resourceRequirement).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (input) => {
    for (const requirement of input.requiredSkills ?? []) {
      const skill = store.archiveRecord(forgeAccountId, 'skill', requirement.skillId);
      if (!skill || skill.deleted || isArchived(skill.payload)) {
        throw new Error(`Required skill ${requirement.skillId} is missing or archived.`);
      }
    }
    for (const requirement of input.requiredResources ?? []) {
      const resource = store.archiveRecord(forgeAccountId, 'resource', requirement.resourceId);
      if (!resource || resource.deleted || isArchived(resource.payload)) {
        throw new Error(`Required resource ${requirement.resourceId} is missing or archived.`);
      }
    }
    return saveRecord('forge_save_capability', 'capability', input, {
      description: '',
      category: 'General',
      requiredSkills: [],
      requiredResources: [],
    });
  },
);

mcp.registerTool(
  'forge_audit_log',
  {
    description:
      'Review recent Forge AI tool activity so the user can see what was read or changed.',
    inputSchema: { limit: z.number().int().min(1).max(100).default(25) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ limit }) => {
    const result = store.recentAudit(forgeAccountId, limit);
    audit('forge_audit_log', 'read', { limit }, { entriesReturned: result.length });
    return textResult(result);
  },
);

const transport = new StdioServerTransport();
await mcp.connect(transport);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    store.close();
    process.exit(0);
  });
}
