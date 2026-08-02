import { resolve } from 'node:path';
import { createForgeServer } from './http.js';

const forgeServer = createForgeServer({
  databasePath: resolve('data/forge-sync.sqlite'),
  host: '0.0.0.0',
  port: 8787,
  allowedOrigin: 'https://josiahinventer-netizen.github.io',
  tlsCertificatePath: resolve('data/certs/forge-local.pem'),
  tlsKeyPath: resolve('data/certs/forge-local-key.pem'),
});

const address = await forgeServer.start();
console.log(`Forge Sync Server listening securely on https://${address.address}:${address.port}`);
console.log('Expected Wi-Fi URL: https://192.168.0.187:8787');
console.log('Account setup and PWA device pairing are still required.');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void forgeServer.stop().finally(() => process.exit(0));
  });
}
