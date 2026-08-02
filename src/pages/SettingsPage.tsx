import { useRef, useState } from 'react';
import { Card, Page } from '../components/UI';
import { SCHEMA_VERSION } from '../database/db';
import { createExport, downloadExport, importData, validateImport } from '../services/dataTransfer';
import type { ExportBundle } from '../types/models';

export function SettingsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [selectedBundle, setSelectedBundle] = useState<ExportBundle | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

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
            Automatic synchronization and chat access are not active yet. Imports and exports are
            always initiated by you.
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
