import { resolve } from 'node:path';
import { restoreEncryptedBackup } from './backup.js';
import { forgeBackupKeyPath, forgeDatabasePath } from './paths.js';

const backupPath = process.argv[2];
if (!backupPath) throw new Error('Usage: npm run backup:restore -- <encrypted-backup-file>');

const previous = restoreEncryptedBackup(
  resolve(backupPath),
  forgeDatabasePath,
  forgeBackupKeyPath,
  process.env.FORGE_BACKUP_RESTORE === 'confirm',
);
console.log(`Forge backup restored. Previous database retained at ${previous}`);
