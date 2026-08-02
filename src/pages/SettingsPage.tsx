import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, Page } from '../components/UI';
import { db, SCHEMA_VERSION } from '../database/db';
import { createExport, downloadExport, importData, validateImport } from '../services/dataTransfer';
import { connectDevice, syncNow } from '../services/sync';
import type { ExportBundle } from '../types/models';

export function SettingsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [selectedBundle, setSelectedBundle] = useState<ExportBundle | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const syncSettings = useLiveQuery(() => db.syncSettings.get('primary'), []);
  const [serverUrl, setServerUrl] = useState('https://192.168.0.187:8787');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);

  const connect = async (createAccount: boolean) => {
    setSyncBusy(true);
    setStatus('');
    try {
      await connectDevice(serverUrl, username, password, createAccount);
      setPassword('');
      const result = await syncNow();
      setStatus(`Connected and synchronized ${result.pushed} local records.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not connect to Forge Sync.');
    } finally {
      setSyncBusy(false);
    }
  };

  const synchronize = async () => {
    setSyncBusy(true);
    try {
      const result = await syncNow();
      setStatus(`Sync complete: checked ${result.pushed} local and received ${result.pulled}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Synchronization failed.');
    } finally {
      setSyncBusy(false);
    }
  };

  const exportAll = async () => {
    const bundle = await createExport();
    downloadExport(bundle);
    setStatus(
      `Exported ${bundle.records.skills.length} skills, ${bundle.records.resources.length} resources, and ${bundle.records.capabilities.length} capabilities.`,
    );
  };

  const selectImport = async (file: File) => {
    setStatus('');
    setSelectedName(file.name);
    setSelectedBundle(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = validateImport(parsed);
      if (!result.valid) {
        setValidationErrors(result.errors);
        return;
      }
      setValidationErrors([]);
      setSelectedBundle(result.bundle);
    } catch {
      setValidationErrors(['The selected file is not valid JSON.']);
    }
  };

  const completeImport = async (mode: 'merge' | 'replace') => {
    if (!selectedBundle) return;
    if (
      mode === 'replace' &&
      !window.confirm(
        'Replace every skill, resource, and capability stored on this device? Export a backup first if you may need the current data.',
      )
    ) {
      return;
    }
    const result = await importData(selectedBundle, mode);
    setStatus(
      `${mode === 'merge' ? 'Merged' : 'Replaced with'} ${result.skills} skills, ${result.resources} resources, and ${result.capabilities} capabilities.`,
    );
    setSelectedBundle(null);
    setSelectedName('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <Page title="Data transfer" subtitle="Move complete Forge backups between your devices.">
      <div className="settings-grid">
        <Card>
          <h2>Computer synchronization</h2>
          {syncSettings ? (
            <>
              <p>
                Connected as <b>{syncSettings.username}</b>
                <br />
                <span className="muted">{syncSettings.serverUrl}</span>
              </p>
              <p className="muted">
                {syncSettings.lastSyncAt
                  ? `Last synchronized ${new Date(syncSettings.lastSyncAt).toLocaleString()}`
                  : 'Waiting for the first synchronization.'}
                {syncSettings.lastError ? ` Last error: ${syncSettings.lastError}` : ''}
              </p>
              <button disabled={syncBusy} onClick={() => void synchronize()}>
                {syncBusy ? 'Synchronizingâ€¦' : 'Sync now'}
              </button>
            </>
          ) : (
            <form
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                void connect(false);
              }}
            >
              <label>
                Computer address
                <input
                  type="url"
                  inputMode="url"
                  required
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                />
              </label>
              <label>
                Local username
                <input
                  required
                  minLength={3}
                  autoComplete="off"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  required
                  minLength={12}
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <div className="actions">
                <button disabled={syncBusy} type="submit">
                  Sign in
                </button>
                <button
                  disabled={syncBusy || username.trim().length < 3 || password.length < 12}
                  type="button"
                  onClick={() => void connect(true)}
                >
                  Create local account
                </button>
              </div>
              <p className="muted">
                This account exists only on your computer. Your password is used to sign in and is
                not saved on this device.
              </p>
            </form>
          )}
        </Card>

        <Card>
          <h2>Download JSON backup</h2>
          <p>
            The human-readable file contains export metadata and every skill, resource, and
            capability, including archived records.
          </p>
          <button onClick={exportAll}>Export all data</button>
        </Card>

        <Card>
          <h2>Import JSON backup</h2>
          <p>Select a Forge backup. Forge validates the complete file before offering an import.</p>
          <input
            ref={inputRef}
            className="file-input"
            type="file"
            accept="application/json,.json"
            aria-label="Select Forge JSON backup"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void selectImport(file);
            }}
          />
          {selectedBundle && (
            <div className="import-preview">
              <b>{selectedName}</b>
              <p>
                {selectedBundle.records.skills.length} skills ·{' '}
                {selectedBundle.records.resources.length} resources ·{' '}
                {selectedBundle.records.capabilities.length} capabilities
              </p>
              <div className="actions">
                <button onClick={() => void completeImport('merge')}>Merge with this device</button>
                <button className="danger" onClick={() => void completeImport('replace')}>
                  Replace this device
                </button>
              </div>
              <p className="muted">
                Merge keeps records with unique IDs and uses the newest update when the same ID
                exists on both devices.
              </p>
            </div>
          )}
          {validationErrors.length > 0 && (
            <div className="validation-errors" role="alert">
              <b>{selectedName} cannot be imported</b>
              <ul>
                {validationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card>
          <h2>Application information</h2>
          <p>
            App version <b>{__APP_VERSION__}</b>
            <br />
            Database schema <b>{SCHEMA_VERSION}</b>
          </p>
          <p className="muted">
            Local computer synchronization runs while Forge is open. Chat access is not active yet.
          </p>
        </Card>
      </div>
      {status && (
        <p role="status" className="evidence transfer-status">
          {status}
        </p>
      )}
    </Page>
  );
}
