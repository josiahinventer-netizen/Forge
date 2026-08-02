import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { baseRecord, db, now } from '../database/db';
import {
  PRACTICE_KINDS,
  VERIFICATION_STATUSES,
  type Activity,
  type PracticeKind,
  type VerificationStatus,
} from '../types/models';
import { Card, Empty, Field, Modal, Page, formatDate } from '../components/UI';
import { EvidenceAttachments } from '../components/EvidenceAttachments';
import { SpeechInput } from '../components/SpeechInput';

const emptyActivity = (): Activity => ({
  ...baseRecord(),
  title: '',
  description: '',
  purpose: '',
  occurredAt: now(),
  durationMinutes: 0,
  outcome: '',
  reflection: '',
  skillPractice: [],
  linkedResourceIds: [],
  linkedCapabilityIds: [],
  linkedTodoIds: [],
});
const localInput = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function ActivitiesPage() {
  const activities =
    useLiveQuery(
      () =>
        db.activities
          .filter((item) => !item.archived)
          .reverse()
          .sortBy('occurredAt'),
      [],
    ) ?? [];
  const links = useLiveQuery(
    async () => ({
      skills: await db.skills.filter((item) => !item.archived).toArray(),
      resources: await db.resources.filter((item) => !item.archived).toArray(),
      capabilities: await db.capabilities.filter((item) => !item.archived).toArray(),
      todos: await db.todos.filter((item) => !item.archived).toArray(),
    }),
    [],
  ) ?? { skills: [], resources: [], capabilities: [], todos: [] };
  const attachments =
    useLiveQuery(
      () =>
        db.attachments.filter((item) => !item.archived && item.ownerType === 'activity').toArray(),
      [],
    ) ?? [];
  const [edit, setEdit] = useState<Activity | null>(null);
  const [query, setQuery] = useState('');
  const shown = activities.filter((item) =>
    `${item.title} ${item.purpose} ${item.outcome}`.toLowerCase().includes(query.toLowerCase()),
  );
  const toggle = (
    field: 'linkedResourceIds' | 'linkedCapabilityIds' | 'linkedTodoIds',
    id: string,
  ) => {
    if (!edit) return;
    setEdit({
      ...edit,
      [field]: edit[field].includes(id)
        ? edit[field].filter((value) => value !== id)
        : [...edit[field], id],
    });
  };
  const setSkill = (skillId: string, checked: boolean) => {
    if (!edit) return;
    setEdit({
      ...edit,
      skillPractice: checked
        ? [
            ...edit.skillPractice,
            {
              skillId,
              kind: 'Independent application',
              minutes: edit.durationMinutes,
              verificationStatus: 'Activity-supported',
              notes: '',
            },
          ]
        : edit.skillPractice.filter((entry) => entry.skillId !== skillId),
    });
  };
  return (
    <Page
      title="Activity & evidence"
      subtitle="Record what happened, why it mattered, and what it demonstrates"
      action={<button onClick={() => setEdit(emptyActivity())}>+ Log activity</button>}
    >
      <div className="toolbar">
        <input
          className="search"
          aria-label="Search activities"
          placeholder="Search activities"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {shown.length ? (
        <div className="list">
          {shown.map((activity) => (
            <Card key={activity.id}>
              <div className="row">
                <div>
                  <span className="pill">{formatDate(activity.occurredAt)}</span>
                  <h3>{activity.title}</h3>
                  <p>
                    <strong>Why:</strong> {activity.purpose}
                  </p>
                  <p className="muted">
                    {activity.durationMinutes} min · {activity.skillPractice.length} linked skill
                    {activity.skillPractice.length === 1 ? '' : 's'}
                  </p>
                  {activity.outcome && (
                    <p>
                      <strong>Outcome:</strong> {activity.outcome}
                    </p>
                  )}
                  {attachments.some((item) => item.ownerId === activity.id) && (
                    <p className="evidence">
                      Photo evidence ·{' '}
                      {attachments.filter((item) => item.ownerId === activity.id).length}
                    </p>
                  )}
                </div>
                <button className="secondary" onClick={() => setEdit(activity)}>
                  View / edit
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>Log something you practiced, built, repaired, produced, learned, or taught.</Empty>
      )}
      {edit && (
        <Modal
          title={
            activities.some((item) => item.id === edit.id) ? 'Activity details' : 'Log activity'
          }
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              await db.activities.put({ ...edit, updatedAt: now() });
              setEdit(null);
            }}
          >
            <Field label="What did you do?">
              <SpeechInput
                required
                value={edit.title}
                onChange={(title) => setEdit({ ...edit, title })}
              />
            </Field>
            <Field label="Why did you do it?">
              <SpeechInput
                multiline
                required
                value={edit.purpose}
                onChange={(purpose) => setEdit({ ...edit, purpose })}
              />
            </Field>
            <div className="form-grid">
              <Field label="When">
                <input
                  required
                  type="datetime-local"
                  value={localInput(edit.occurredAt)}
                  onChange={(event) =>
                    setEdit({ ...edit, occurredAt: new Date(event.target.value).toISOString() })
                  }
                />
              </Field>
              <Field label="Total minutes">
                <input
                  required
                  type="number"
                  min="0"
                  value={edit.durationMinutes}
                  onChange={(event) =>
                    setEdit({ ...edit, durationMinutes: Number(event.target.value) })
                  }
                />
              </Field>
            </div>
            <Field label="Details">
              <textarea
                value={edit.description}
                onChange={(event) => setEdit({ ...edit, description: event.target.value })}
              />
            </Field>
            <Field label="Observable outcome">
              <SpeechInput
                multiline
                value={edit.outcome}
                onChange={(outcome) => setEdit({ ...edit, outcome })}
                placeholder="What was built, fixed, tested, or demonstrated?"
              />
            </Field>
            <Field label="Reflection / next improvement">
              <textarea
                value={edit.reflection}
                onChange={(event) => setEdit({ ...edit, reflection: event.target.value })}
              />
            </Field>
            <fieldset>
              <legend>Skill evidence</legend>
              {links.skills.map((skill) => {
                const entry = edit.skillPractice.find((item) => item.skillId === skill.id);
                return (
                  <div key={skill.id} className="evidence-link">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(entry)}
                        onChange={(event) => setSkill(skill.id, event.target.checked)}
                      />{' '}
                      {skill.name}
                    </label>
                    {entry && (
                      <div className="form-grid">
                        <Field label="Practice type">
                          <select
                            value={entry.kind}
                            onChange={(event) =>
                              setEdit({
                                ...edit,
                                skillPractice: edit.skillPractice.map((item) =>
                                  item.skillId === skill.id
                                    ? { ...item, kind: event.target.value as PracticeKind }
                                    : item,
                                ),
                              })
                            }
                          >
                            {PRACTICE_KINDS.map((kind) => (
                              <option key={kind}>{kind}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Minutes">
                          <input
                            type="number"
                            min="0"
                            value={entry.minutes}
                            onChange={(event) =>
                              setEdit({
                                ...edit,
                                skillPractice: edit.skillPractice.map((item) =>
                                  item.skillId === skill.id
                                    ? { ...item, minutes: Number(event.target.value) }
                                    : item,
                                ),
                              })
                            }
                          />
                        </Field>
                        <Field label="Evidence status">
                          <select
                            value={entry.verificationStatus}
                            onChange={(event) =>
                              setEdit({
                                ...edit,
                                skillPractice: edit.skillPractice.map((item) =>
                                  item.skillId === skill.id
                                    ? {
                                        ...item,
                                        verificationStatus: event.target
                                          .value as VerificationStatus,
                                      }
                                    : item,
                                ),
                              })
                            }
                          >
                            {VERIFICATION_STATUSES.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    )}
                  </div>
                );
              })}
            </fieldset>
            <fieldset>
              <legend>Other connected records</legend>
              {(
                [
                  ['Resources', 'linkedResourceIds', links.resources],
                  ['Capabilities', 'linkedCapabilityIds', links.capabilities],
                  ['Todos', 'linkedTodoIds', links.todos],
                ] as const
              ).map(([label, field, records]) => (
                <div className="link-options" key={label}>
                  <strong>{label}</strong>
                  {records.map((record) => (
                    <label className="check" key={record.id}>
                      <input
                        type="checkbox"
                        checked={edit[field].includes(record.id)}
                        onChange={() => toggle(field, record.id)}
                      />{' '}
                      {'name' in record ? record.name : record.title}
                    </label>
                  ))}
                </div>
              ))}
            </fieldset>
            <EvidenceAttachments
              ownerType="activity"
              ownerId={edit.id}
              ownerName={edit.title || 'activity'}
              saved={activities.some((item) => item.id === edit.id)}
            />
            <div className="actions">
              <button>Save activity</button>
              {activities.some((item) => item.id === edit.id) && (
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    if (!confirm('Archive this activity? It will remain in your data.')) return;
                    await db.activities.update(edit.id, { archived: true, updatedAt: now() });
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
