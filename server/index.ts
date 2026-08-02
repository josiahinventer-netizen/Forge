import { resolve } from 'node:path';
import { createForgeServer } from './http.js';

const host = process.env.FORGE_SERVER_HOST ?? '127.0.0.1';
const port = Number(process.env.FORGE_SERVER_PORT ?? '8787');
const databasePath = resolve(process.env.FORGE_SERVER_DATA ?? 'data/forge-sync.sqlite');
const allowedOrigin =
  process.env.FORGE_ALLOWED_ORIGIN ?? 'https://josiahinventer-netizen.github.io';
const tlsCertificatePath = process.env.FORGE_TLS_CERT;
const tlsKeyPath = process.env.FORGE_TLS_KEY;

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error('FORGE_SERVER_PORT must be a valid TCP port.');
}

const forgeServer = createForgeServer({
  databasePath,
  host,
  port,
  allowedOrigin,
  tlsCertificatePath,
  tlsKeyPath,
});
const address = await forgeServer.start();
console.log(
  `Forge Sync Server listening on ${tlsCertificatePath && tlsKeyPath ? 'https' : 'http'}://${address.address}:${address.port}`,
);
console.log(`Database: ${databasePath}`);
console.log(
  tlsCertificatePath && tlsKeyPath
    ? 'Encrypted transport is enabled. Account setup and device pairing are still required.'
    : 'LAN access is disabled until local HTTPS and device pairing are configured.',
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void forgeServer.stop().finally(() => process.exit(0));
  });
}
