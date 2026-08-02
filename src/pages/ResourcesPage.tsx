import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, baseRecord, now } from '../database/db';
import type { Resource } from '../types/models';
import { RESOURCE_TYPES } from '../types/models';
import { Card, Empty, Field, Modal, Page } from '../components/UI';
const empty = (): Resource => ({
  ...baseRecord(),
  name: '',
  description: '',
  category: 'General',
  resourceType: 'Tool',
  quantity: 1,
  unit: 'item',
  condition: 'Good',
  location: '',
  notes: '',
});
export function ResourcesPage() {
  const items = useLiveQuery(() => db.resources.filter((r) => !r.archived).toArray(), []) || [];
  const [edit, setEdit] = useState<Resource | null>(null),
    [q, setQ] = useState('');
  const shown = items.filter((r) =>
    (r.name + r.resourceType + r.location).toLowerCase().includes(q.toLowerCase()),
  );
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (edit) {
      await db.resources.put({ ...edit, updatedAt: now() });
      setEdit(null);
    }
  };
  return (
    <Page
      title="Resources"
      subtitle={`${items.length} tools, materials, and assets recorded`}
      action={<button onClick={() => setEdit(empty())}>+ Quick add</button>}
    >
      <input
        className="search"
        placeholder="Search inventory"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search resources"
      />
      {shown.length ? (
        <div className="list compact">
          {shown.map((r) => (
            <Card key={r.id}>
              <div className="row">
                <div>
                  <span className="pill">{r.resourceType}</span>
                  <h3>{r.name}</h3>
                  <p className="muted">
                    {r.condition}
                    {r.location && ` · ${r.location}`}
                  </p>
                </div>
                <div className="quantity">
                  <b>{r.quantity}</b>
                  <small>{r.unit}</small>
                  <button className="secondary" onClick={() => setEdit(r)}>
                    Edit
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>Add one tool or material to begin your local inventory.</Empty>
      )}
      {edit && (
        <Modal
          title={edit.name ? 'Edit resource' : 'Quick add resource'}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <Field label="Name">
              <input
                required
                autoFocus
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Type">
                <select
                  value={edit.resourceType}
                  onChange={(e) => setEdit({ ...edit, resourceType: e.target.value })}
                >
                  {RESOURCE_TYPES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <input
                  value={edit.category}
                  onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                />
              </Field>
              <Field label="Quantity">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={edit.quantity}
                  onChange={(e) => setEdit({ ...edit, quantity: Number(e.target.value) })}
                />
              </Field>
              <Field label="Unit">
                <input
                  value={edit.unit}
                  onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Condition">
              <input
                value={edit.condition}
                onChange={(e) => setEdit({ ...edit, condition: e.target.value })}
              />
            </Field>
            <Field label="Location">
              <input
                value={edit.location}
                onChange={(e) => setEdit({ ...edit, location: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={edit.notes}
                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
              />
            </Field>
            <div className="actions">
              <button>Save resource</button>
              {items.some((r) => r.id === edit.id) && (
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    await db.resources.update(edit.id, { archived: true });
                    setEdit(null);
                  }}
                >
                  Archive
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </Page>
  );
}
