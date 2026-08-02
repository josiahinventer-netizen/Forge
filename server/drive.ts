import { ForgeDriveBridge } from './driveBridge.js';
import { forgeDatabasePath, forgeDriveDirectory } from './paths.js';
import { ForgeSyncStore } from './store.js';

const username = process.env.FORGE_DRIVE_USERNAME ?? 'josiahv';
const store = new ForgeSyncStore(forgeDatabasePath);
try {
  const result = new ForgeDriveBridge({
    driveDirectory: forgeDriveDirectory,
    username,
    store,
  }).runOnce();
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.close();
}
