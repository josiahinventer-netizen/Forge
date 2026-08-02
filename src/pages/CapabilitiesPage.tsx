import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, Empty, Field, Modal, Page } from '../components/UI';
import { baseRecord, db, now } from '../database/db';
import { assessCapability } from '../services/capabilityAvailability';
import type {
  Capability,
  CapabilityResourceRequirement,
  CapabilitySkillRequirement,
  Level,
  Resource,
  Skill,
} from '../types/models';
import { LEVEL_LABELS } from '../types/models';

const emptyCapability = (): Capability => ({
  ...baseRecord(),
  name: '',
  description: '',
  category: 'General',
  requiredSkills: [],
  requiredResources: [],
});

interface CapabilityFormProps {
  capability: Capability;
  skills: Skill[];
  resources: Resource[];
  existing: boolean;
  onChange: (capability: Capability) => void;
  onClose: () => void;
}

function CapabilityForm({
  capability,
  skills,
  resources,
  existing,
  onChange,
  onClose,
}: CapabilityFormProps) {
  const activeSkills = skills.filter((skill) => !skill.archived);
  const activeResources = resources.filter((resource) => !resource.archived);
  const addableSkill = activeSkills.find(
    (skill) => !capability.requiredSkills.some((requirement) => requirement.skillId === skill.id),
  );
  const addableResource = activeResources.find(
    (resource) =>
      !capability.requiredResources.some((requirement) => requirement.resourceId === resource.id),
  );

  const updateSkill = (index: number, update: Partial<CapabilitySkillRequirement>) => {
    onChange({
      ...capability,
      requiredSkills: capability.requiredSkills.map((requirement, candidateIndex) =>
        candidateIndex === index ? { ...requirement, ...update } : requirement,
      ),
    });
  };
  const updateResource = (index: number, update: Partial<CapabilityResourceRequirement>) => {
    onChange({
      ...capability,
      requiredResources: capability.requiredResources.map((requirement, candidateIndex) =>
        candidateIndex === index ? { ...requirement, ...update } : requirement,
      ),
    });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    await db.capabilities.put({ ...capability, updatedAt: now() });
    onClose();
  };

  return (
    <form onSubmit={save}>
      <Field label="Name">
        <input
          required
          autoFocus
          value={capability.name}
          onChange={(event) => onChange({ ...capability, name: event.target.value })}
        />
      </Field>
      <Field label="Category">
        <input
          required
          value={capability.category}
          onChange={(event) => onChange({ ...capability, category: event.target.value })}
        />
      </Field>
      <Field label="Description">
        <textarea
          value={capability.description}
          onChange={(event) => onChange({ ...capability, description: event.target.value })}
        />
      </Field>

      <div className="requirement-editor">
        <div className="row">
          <h3>Required skills</h3>
          <button
            type="button"
            className="secondary"
            disabled={!addableSkill}
            onClick={() =>
              addableSkill &&
              onChange({
                ...capability,
                requiredSkills: [
                  ...capability.requiredSkills,
                  {
                    skillId: addableSkill.id,
                    minimumKnowledgeLevel: 0,
                    minimumPracticalLevel: 0,
                  },
                ],
              })
            }
          >
            + Add skill
          </button>
        </div>
        {!activeSkills.length && <p className="muted">Add an active skill before requiring it.</p>}
        {capability.requiredSkills.map((requirement, index) => (
          <div className="requirement-row" key={`${requirement.skillId}-${index}`}>
            <Field label="Skill">
              <select
                value={requirement.skillId}
                onChange={(event) => updateSkill(index, { skillId: event.target.value })}
              >
                {skills.map((skill) => (
                  <option
                    key={skill.id}
                    value={skill.id}
                    disabled={
                      skill.archived ||
                      capability.requiredSkills.some(
                        (candidate, candidateIndex) =>
                          candidateIndex !== index && candidate.skillId === skill.id,
                      )
                    }
                  >
                    {skill.name}
                    {skill.archived ? ' (archived)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Min. knowledge">
              <select
                value={requirement.minimumKnowledgeLevel}
                onChange={(event) =>
                  updateSkill(index, {
                    minimumKnowledgeLevel: Number(event.target.value) as Level,
                  })
                }
              >
                {LEVEL_LABELS.map((label, level) => (
                  <option key={label} value={level}>
                    {level} · {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Min. practical">
              <select
                value={requirement.minimumPracticalLevel}
                onChange={(event) =>
                  updateSkill(index, {
                    minimumPracticalLevel: Number(event.target.value) as Level,
                  })
                }
              >
                {LEVEL_LABELS.map((label, level) => (
                  <option key={label} value={level}>
                    {level} · {label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              className="ghost remove-requirement"
              onClick={() =>
                onChange({
                  ...capability,
                  requiredSkills: capability.requiredSkills.filter(
                    (_, candidateIndex) => candidateIndex !== index,
                  ),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="requirement-editor">
        <div className="row">
          <h3>Required resources</h3>
          <button
            type="button"
            className="secondary"
            disabled={!addableResource}
            onClick={() =>
              addableResource &&
              onChange({
                ...capability,
                requiredResources: [
                  ...capability.requiredResources,
                  {
                    resourceId: addableResource.id,
                    requiredQuantity: 1,
                    unit: addableResource.unit,
                  },
                ],
              })
            }
          >
            + Add resource
          </button>
        </div>
        {!activeResources.length && (
          <p className="muted">Add an active resource before requiring it.</p>
        )}
        {capability.requiredResources.map((requirement, index) => (
          <div
            className="requirement-row resource-requirement"
            key={`${requirement.resourceId}-${index}`}
          >
            <Field label="Resource">
              <select
                value={requirement.resourceId}
                onChange={(event) => {
                  const resource = resources.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  updateResource(index, {
                    resourceId: event.target.value,
                    unit: resource?.unit ?? requirement.unit,
                  });
                }}
              >
                {resources.map((resource) => (
                  <option
                    key={resource.id}
                    value={resource.id}
                    disabled={
                      resource.archived ||
                      capability.requiredResources.some(
                        (candidate, candidateIndex) =>
                          candidateIndex !== index && candidate.resourceId === resource.id,
                      )
                    }
                  >
                    {resource.name}
                    {resource.archived ? ' (archived)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Required quantity">
              <input
                type="number"
                min="0"
                step="any"
                required
                value={requirement.requiredQuantity}
                onChange={(event) =>
                  updateResource(index, { requiredQuantity: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Unit">
              <input
                required
                value={requirement.unit}
                onChange={(event) => updateResource(index, { unit: event.target.value })}
              />
            </Field>
            <button
              type="button"
              className="ghost remove-requirement"
              onClick={() =>
                onChange({
                  ...capability,
                  requiredResources: capability.requiredResources.filter(
                    (_, candidateIndex) => candidateIndex !== index,
                  ),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="actions">
        <button type="submit">Save capability</button>
        {existing && (
          <button
            type="button"
            className="danger"
            onClick={async () => {
              await db.capabilities.update(capability.id, { archived: true, updatedAt: now() });
              onClose();
            }}
          >
            Archive
          </button>
        )}
      </div>
    </form>
  );
}

export function CapabilitiesPage() {
  const data = useLiveQuery(async () => ({
    capabilities: await db.capabilities.filter((capability) => !capability.archived).toArray(),
    skills: await db.skills.toArray(),
    resources: await db.resources.toArray(),
  }));
  const [editing, setEditing] = useState<Capability | null>(null);
  const [query, setQuery] = useState('');
  if (!data) return <Page title="Capabilities">Loading local records…</Page>;

  const shown = data.capabilities.filter((capability) =>
    `${capability.name} ${capability.category} ${capability.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <Page
      title="Capabilities"
      subtitle="What your current skills and resources make possible."
      action={<button onClick={() => setEditing(emptyCapability())}>+ Add capability</button>}
    >
      <input
        className="search"
        aria-label="Search capabilities"
        placeholder="Search capabilities or categories"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {shown.length ? (
        <div className="list">
          {shown.map((capability) => {
            const assessment = assessCapability(capability, data.skills, data.resources);
            return (
              <Card key={capability.id}>
                <div className="row">
                  <div>
                    <span className={`status ${assessment.status.toLowerCase().replace(' ', '-')}`}>
                      {assessment.status}
                    </span>
                    <h3>{capability.name}</h3>
                    <p className="muted">{capability.category}</p>
                  </div>
                  <div className="actions">
                    <Link className="button secondary" to={`/capabilities/${capability.id}`}>
                      View
                    </Link>
                    <button className="secondary" onClick={() => setEditing(capability)}>
                      Edit
                    </button>
                  </div>
                </div>
                <p>{capability.description}</p>
                {assessment.missingExplanations.length > 0 && (
                  <div className="requirements">
                    <b>Missing requirements</b>
                    {assessment.missingExplanations.map((explanation) => (
                      <p key={explanation}>× {explanation}</p>
                    ))}
                  </div>
                )}
                {assessment.recommendedStep && (
                  <p className="hint">
                    <b>Recommended step:</b> {assessment.recommendedStep}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty>
          {data.capabilities.length
            ? 'No capabilities match this search.'
            : 'Add something you want to build, repair, perform, produce, or teach.'}
        </Empty>
      )}
      {editing && (
        <Modal
          title={editing.name ? 'Edit capability' : 'Add capability'}
          onClose={() => setEditing(null)}
        >
          <CapabilityForm
            capability={editing}
            skills={data.skills}
            resources={data.resources}
            existing={data.capabilities.some((capability) => capability.id === editing.id)}
            onChange={setEditing}
            onClose={() => setEditing(null)}
          />
        </Modal>
      )}
    </Page>
  );
}

export function CapabilityDetailPage() {
  const { capabilityId } = useParams();
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    if (!capabilityId) return undefined;
    const capability = await db.capabilities.get(capabilityId);
    if (!capability) return undefined;
    return {
      capability,
      skills: await db.skills.toArray(),
      resources: await db.resources.toArray(),
    };
  }, [capabilityId]);
  const [editing, setEditing] = useState<Capability | null>(null);

  if (!data) {
    return (
      <Page title="Capability not found">
        <Link className="button secondary" to="/capabilities">
          Back to capabilities
        </Link>
      </Page>
    );
  }

  const { capability, skills, resources } = data;
  const assessment = assessCapability(capability, skills, resources);
  return (
    <Page
      title={capability.name}
      subtitle={capability.category}
      action={<button onClick={() => setEditing(capability)}>Edit</button>}
    >
      <Link className="back-link" to="/capabilities">
        ← All capabilities
      </Link>
      <Card>
        <span className={`status ${assessment.status.toLowerCase().replace(' ', '-')}`}>
          {assessment.status}
        </span>
        <p>{capability.description || 'No description recorded.'}</p>
        <p className="muted">
          {assessment.metRequirementCount} of {assessment.totalRequirementCount} requirements fully
          met
        </p>

        <h2>Required skills</h2>
        {capability.requiredSkills.length ? (
          <div className="detail-requirements">
            {capability.requiredSkills.map((requirement) => {
              const skill = skills.find((candidate) => candidate.id === requirement.skillId);
              return (
                <div key={requirement.skillId}>
                  <b>{skill?.name ?? `Missing skill ${requirement.skillId}`}</b>
                  <span>
                    Knowledge {requirement.minimumKnowledgeLevel} · Practical{' '}
                    {requirement.minimumPracticalLevel}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No required skills.</p>
        )}

        <h2>Required resources</h2>
        {capability.requiredResources.length ? (
          <div className="detail-requirements">
            {capability.requiredResources.map((requirement) => {
              const resource = resources.find(
                (candidate) => candidate.id === requirement.resourceId,
              );
              return (
                <div key={requirement.resourceId}>
                  <b>{resource?.name ?? `Missing resource ${requirement.resourceId}`}</b>
                  <span>
                    {requirement.requiredQuantity} {requirement.unit} required
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No required resources.</p>
        )}

        {assessment.missingExplanations.length > 0 && (
          <div className="requirements">
            <b>What is missing</b>
            {assessment.missingExplanations.map((explanation) => (
              <p key={explanation}>× {explanation}</p>
            ))}
          </div>
        )}
        {assessment.recommendedStep && (
          <div className="recommended-step">
            <b>Recommended next step</b>
            <p>{assessment.recommendedStep}</p>
          </div>
        )}
      </Card>
      {editing && (
        <Modal title="Edit capability" onClose={() => setEditing(null)}>
          <CapabilityForm
            capability={editing}
            skills={skills}
            resources={resources}
            existing
            onChange={setEditing}
            onClose={() => setEditing(null)}
          />
        </Modal>
      )}
      {capability.archived && (
        <button className="secondary" onClick={() => navigate('/capabilities')}>
          Return to active capabilities
        </button>
      )}
    </Page>
  );
}
