import { useState } from 'react';
import { Card, Page } from '../components/UI';
import { SCHEMA_VERSION } from '../database/db';
import { createExport, downloadExport } from '../services/dataTransfer';

export function SettingsPage() {
  const [status, setStatus] = useState('');

  const exportAll = async () => {
    const bundle = await createExport();
    downloadExport(bundle);
    setStatus(
      `Exported ${bundle.records.skills.length} skills, ${bundle.records.resources.length} resources, and ${bundle.records.capabilities.length} capabilities.`,
    );
  };

  return (
    <Page title="Data export" subtitle="Your records remain in this browser until you export them.">
      <div className="settings-grid">
        <Card>
          <h2>Download JSON backup</h2>
          <p>
            The human-readable file contains export metadata and every skill, resource, and
            capability, including archived records.
          </p>
          <button onClick={exportAll}>Export all data</button>
          {status && (
            <p role="status" className="evidence">
              {status}
            </p>
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
            Import, synchronization, and destructive data controls are deferred to later stages.
          </p>
        </Card>
      </div>
    </Page>
  );
}
