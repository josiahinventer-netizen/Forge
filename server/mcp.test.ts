// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';
import { ForgeSyncStore } from './store.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (directory.startsWith(tmpdir())) rmSync(directory, { recursive: true, force: true });
  }
});

describe('Forge MCP server', () => {
  it('lists tools, writes a confirmed skill, searches it, and records an audit trail', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'forge-mcp-test-'));
    temporaryDirectories.push(dataDirectory);
    const databasePath = join(dataDirectory, 'forge-sync.sqlite');
    const setupStore = new ForgeSyncStore(databasePath);
    await setupStore.createAccount('mcp-user', 'long secure password');
    setupStore.close();

    const environment = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string';
      }),
    );
    environment.FORGE_DATA_DIR = dataDirectory;
    environment.FORGE_MCP_USERNAME = 'mcp-user';
    environment.FORGE_MCP_WRITE = 'enabled';
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve('node_modules/tsx/dist/cli.mjs'), resolve('server/mcp.ts')],
      cwd: process.cwd(),
      env: environment,
    });
    const client = new Client({ name: 'forge-test-client', version: '1.0.0' });

    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain('forge_save_skill');
      const saved = await client.callTool({
        name: 'forge_save_skill',
        arguments: {
          name: 'Test carpentry',
          category: 'Making',
          knowledgeLevel: 2,
          practicalLevel: 1,
          evidenceNotes: 'Built a test fixture.',
          confirm: true,
        },
      });
      expect(saved.isError).not.toBe(true);
      const searched = await client.callTool({
        name: 'forge_search',
        arguments: { query: 'carpentry', entityTypes: ['skill'] },
      });
      expect(JSON.stringify(searched.content)).toContain('Test carpentry');
    } finally {
      await client.close();
    }

    const verificationStore = new ForgeSyncStore(databasePath);
    const accountId = verificationStore.accountIdForUsername('mcp-user');
    expect(accountId).not.toBeNull();
    expect(verificationStore.archiveRecords(accountId!, ['skill'])).toHaveLength(1);
    expect(verificationStore.auditCount(accountId!)).toBe(2);
    verificationStore.close();
  });
});
