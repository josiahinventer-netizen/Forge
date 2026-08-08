import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, baseRecord, now } from '../database/db';
import type { Level, Skill } from '../types/models';
import { LEVEL_LABELS } from '../types/models';
import { Card, Empty, Field, Modal, Page } from '../components/UI';
import { summarizeSkillEvidence } from '../services/activityEvidence';
import { EvidenceAttachments } from '../components/EvidenceAttachments';
import { DocumentEvidence } from '../components/DocumentEvidence';
const empty = (): Skill => ({
  ...baseRecord(),
  name: '',
  description: '',
  category: 'General preparedness',
  knowledgeLevel: 0,
  practicalLevel: 0,
  confidence: 50,
  evidenceNotes: '',
  evidenceLinks: [],
});
export function SkillsPage() {
  const skills = useLiveQuery(() => db.skills.filter((s) => !s.archived).toArray(), []) || [];
  const activities =
    useLiveQuery(() => db.activities.filter((item) => !item.archived).toArray(), []) || [];
  const attachments =
    useLiveQuery(
      () => db.attachments.filter((item) => !item.archived && item.ownerType === 'skill').toArray(),
      [],
    ) || [];
  const [edit, setEdit] = useState<Skill | null>(null);
  const [q, setQ] = useState('');
  const shown = skills.filter((s) => (s.name + s.category).toLowerCase().includes(q.toLowerCase()));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (edit) {
      await db.skills.put({ ...edit, updatedAt: now() });
      setEdit(null);
    }
  };
  return (
    <Page
      title="Skills"
      subtitle="Knowledge and demonstrated ability are tracked separately."
      action={<button onClick={() => setEdit(empty())}>+ Add skill</button>}
    >
      <input
        className="search"
        placeholder="Search skills or categories"
        aria-label="Search skills"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {shown.length ? (
        <div className="list">
          {shown.map((s) => (
            <Card key={s.id}>
              <div className="row">
                <div>
                  <h3>{s.name}</h3>
                  <p className="muted">{s.category}</p>
                </div>
                <button className="secondary" onClick={() => setEdit(s)}>
                  Edit
                </button>
              </div>
              <div className="levels">
                <span>
                  Knowledge <b>{s.knowledgeLevel}</b>
                  <small>{LEVEL_LABELS[s.knowledgeLevel]}</small>
                </span>
                <span>
                  Practical <b>{s.practicalLevel}</b>
                  <small>{LEVEL_LABELS[s.practicalLevel]}</small>
                </span>
              </div>
              {s.evidenceNotes && <p className="evidence">Evidence · {s.evidenceNotes}</p>}
              <p className="evidence">
                Logged evidence · {summarizeSkillEvidence(s, activities).activityCount} activities ·{' '}
                {summarizeSkillEvidence(s, activities).totalMinutes} minutes (
                {summarizeSkillEvidence(s, activities).practicalMinutes} practical)
              </p>
              {attachments.some((item) => item.ownerId === s.id) && (
                <p className="evidence">
                  Photo evidence · {attachments.filter((item) => item.ownerId === s.id).length}
                </p>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty>Add a skill you already have. Honest starting points are useful.</Empty>
      )}
      {edit && (
        <Modal title={edit.name ? 'Edit skill' : 'Add a skill'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <Field label="Name">
              <input
                required
                autoFocus
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Category / domain">
              <input
                required
                value={edit.category}
                onChange={(e) => setEdit({ ...edit, category: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <textarea
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Knowledge level">
                <select
                  value={edit.knowledgeLevel}
                  onChange={(e) =>
                    setEdit({ ...edit, knowledgeLevel: Number(e.target.value) as Level })
                  }
                >
                  {LEVEL_LABELS.map((x, i) => (
                    <option value={i} key={x}>
                      {i} · {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Practical level">
                <select
                  value={edit.practicalLevel}
                  onChange={(e) =>
                    setEdit({ ...edit, practicalLevel: Number(e.target.value) as Level })
                  }
                >
                  {LEVEL_LABELS.map((x, i) => (
                    <option value={i} key={x}>
                      {i} · {x}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Confidence (0–100)">
              <input
                type="number"
                min="0"
                max="100"
                value={edit.confidence}
                onChange={(e) => setEdit({ ...edit, confidence: Number(e.target.value) })}
              />
            </Field>
            <Field label="Evidence notes">
              <textarea
                placeholder="What have you demonstrated, built, tested, or taught?"
                value={edit.evidenceNotes}
                onChange={(e) => setEdit({ ...edit, evidenceNotes: e.target.value })}
              />
            </Field>
            <EvidenceAttachments
              ownerType="skill"
              ownerId={edit.id}
              ownerName={edit.name || 'skill'}
              saved={skills.some((skill) => skill.id === edit.id)}
            />
            <DocumentEvidence
              ownerType="skill"
              ownerId={edit.id}
              saved={skills.some((skill) => skill.id === edit.id)}
            />
            <div className="actions">
              <button type="submit">Save skill</button>
              {skills.some((s) => s.id === edit.id) && (
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    await db.skills.update(edit.id, { archived: true, updatedAt: now() });
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
