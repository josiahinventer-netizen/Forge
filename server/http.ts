import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { ForgeSyncStore, validateSyncChange } from './store.js';
import { EncryptedBackupManager } from './backup.js';
import { dirname, join } from 'node:path';

export interface ForgeServerOptions {
  databasePath: string;
  host?: string;
  port?: number;
  allowedOrigin?: string;
  tlsCertificatePath?: string;
  tlsKeyPath?: string;
}

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error('Request body exceeds 1 MB.');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

const fields = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const bearerToken = (request: IncomingMessage) => {
  const authorization = request.headers.authorization;
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
};

export function createForgeServer(options: ForgeServerOptions) {
  const host = options.host ?? '127.0.0.1';
  const hasTls = Boolean(options.tlsCertificatePath && options.tlsKeyPath);
  const isLoopback = host === '127.0.0.1' || host === '::1' || host === 'localhost';
  if (!isLoopback && !hasTls) {
    throw new Error('Forge refuses non-loopback access without a TLS certificate and key.');
  }
  if (Boolean(options.tlsCertificatePath) !== Boolean(options.tlsKeyPath)) {
    throw new Error('Both TLS certificate and key paths are required.');
  }
  const store = new ForgeSyncStore(options.databasePath);
  const backup =
    options.databasePath === ':memory:'
      ? null
      : new EncryptedBackupManager(
          store.database,
          join(dirname(options.databasePath), 'backups'),
          join(dirname(options.databasePath), 'backup.key'),
        );
  const changes = new EventEmitter();
  changes.setMaxListeners(100);
  const allowedOrigin = options.allowedOrigin ?? 'https://josiahinventer-netizen.github.io';
  const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
    const origin = request.headers.origin;
    if (origin === allowedOrigin) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('vary', 'Origin');
      response.setHeader('access-control-allow-headers', 'authorization, content-type');
      response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      if (request.headers['access-control-request-private-network'] === 'true') {
        response.setHeader('access-control-allow-private-network', 'true');
      }
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(origin === allowedOrigin ? 204 : 403);
      response.end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        json(response, 200, { status: 'ok', storage: 'local' });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/accounts') {
        const body = fields(await readJson(request));
        if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
          json(response, 400, { error: 'Username and password are required.' });
          return;
        }
        const account = await store.createAccount(body.username, body.password);
        json(response, 201, account);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/sessions') {
        const body = fields(await readJson(request));
        if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
          json(response, 400, { error: 'Username and password are required.' });
          return;
        }
        const session = await store.createSession(body.username, body.password);
        json(response, 200, session);
        return;
      }
      if (
        request.method === 'POST' &&
        (url.pathname === '/api/pairing/exchange' || url.pathname === '/api/recovery/exchange')
      ) {
        const body = fields(await readJson(request));
        if (!body || typeof body.username !== 'string' || typeof body.code !== 'string') {
          json(response, 400, { error: 'Username and code are required.' });
          return;
        }
        const session =
          url.pathname === '/api/pairing/exchange'
            ? store.exchangePairingCode(body.username, body.code)
            : store.exchangeRecoveryCode(body.username, body.code);
        json(response, 200, session);
        return;
      }

      const token = bearerToken(request);
      const accountId = token ? store.authenticate(token) : null;
      if (!accountId) {
        json(response, 401, { error: 'A valid device session is required.' });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/pairing') {
        json(response, 201, store.createPairingCode(accountId));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/recovery-codes') {
        const body = fields(await readJson(request));
        if (!body || body.confirm !== true) {
          json(response, 400, { error: 'Explicit confirmation is required.' });
          return;
        }
        json(response, 201, { codes: store.createRecoveryCodes(accountId) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/sync/push') {
        const body = fields(await readJson(request));
        if (!body || !Array.isArray(body.changes) || !body.changes.every(validateSyncChange)) {
          json(response, 400, { error: 'Changes are missing or invalid.' });
          return;
        }
        const result = store.push(accountId, body.changes);
        if (result.accepted > 0) {
          changes.emit(accountId);
          void backup?.backupIfDue().catch(() => undefined);
        }
        json(response, 200, result);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/sync/pull') {
        const cursor = Number(url.searchParams.get('cursor') ?? '0');
        if (!Number.isSafeInteger(cursor) || cursor < 0) {
          json(response, 400, { error: 'Cursor must be a nonnegative integer.' });
          return;
        }
        json(response, 200, store.pull(accountId, cursor));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/sync/conflicts') {
        json(response, 200, {
          conflicts: store.conflicts(accountId, url.searchParams.get('status') === 'all'),
        });
        return;
      }
      const conflictMatch = url.pathname.match(/^\/api\/sync\/conflicts\/(\d+)\/resolve$/);
      if (request.method === 'POST' && conflictMatch) {
        const body = fields(await readJson(request));
        if (
          !body ||
          (body.resolution !== 'kept-current' && body.resolution !== 'restored-preserved')
        ) {
          json(response, 400, { error: 'A valid conflict resolution is required.' });
          return;
        }
        const result = store.resolveConflict(accountId, Number(conflictMatch[1]), body.resolution);
        if (result.restored) changes.emit(accountId);
        json(response, 200, result);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/sync/wait') {
        const cursor = Number(url.searchParams.get('cursor') ?? '0');
        if (!Number.isSafeInteger(cursor) || cursor < 0) {
          json(response, 400, { error: 'Cursor must be a nonnegative integer.' });
          return;
        }
        const changed = await new Promise<boolean>((resolve) => {
          const finish = (value: boolean) => {
            clearTimeout(timeout);
            clearInterval(databasePoll);
            changes.off(accountId, onChange);
            response.off('close', onClose);
            resolve(value);
          };
          const onChange = () => finish(true);
          const onClose = () => finish(false);
          const timeout = setTimeout(() => finish(false), 20_000);
          const databasePoll = setInterval(() => {
            if (store.pull(accountId, cursor).changes.length > 0) finish(true);
          }, 500);
          changes.once(accountId, onChange);
          response.once('close', onClose);
          if (store.pull(accountId, cursor).changes.length > 0) finish(true);
        });
        if (!response.writableEnded) json(response, 200, { changed });
        return;
      }
      json(response, 404, { error: 'Not found.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      const clientError =
        message.includes('Username') ||
        message.includes('Password') ||
        message.includes('already exists') ||
        message.includes('Invalid username') ||
        message.includes('pairing code') ||
        message.includes('recovery code') ||
        message.includes('JSON') ||
        message.includes('1 MB');
      json(response, clientError ? 400 : 500, {
        error: clientError ? message : 'Unexpected server error.',
      });
    }
  };
  const server = hasTls
    ? createHttpsServer(
        {
          cert: readFileSync(options.tlsCertificatePath!),
          key: readFileSync(options.tlsKeyPath!),
          minVersion: 'TLSv1.2',
        },
        handleRequest,
      )
    : createHttpServer(handleRequest);

  return {
    store,
    server,
    async start() {
      await backup?.backupIfDue();
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 8787, host, () => resolve());
      });
      return server.address() as AddressInfo;
    },
    async stop() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      store.close();
    },
  };
}
