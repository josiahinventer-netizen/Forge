import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const platformDefault =
  process.platform === 'win32' && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Forge')
    : join(homedir(), '.forge');

export const forgeDataDirectory = resolve(process.env.FORGE_DATA_DIR ?? platformDefault);
export const forgeDatabasePath = join(forgeDataDirectory, 'forge-sync.sqlite');
export const forgeCertificatePath = join(forgeDataDirectory, 'certs', 'forge-local.pem');
export const forgeCertificateKeyPath = join(forgeDataDirectory, 'certs', 'forge-local-key.pem');
