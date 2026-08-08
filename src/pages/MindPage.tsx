import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, Field, Modal, Page } from '../components/UI';
import { DocumentEvidence } from '../components/DocumentEvidence';
import { baseRecord, db, now } from '../database/db';
import {
  connectedMindEdges,
  mindEdgeIntegrityIssues,
  relationshipLabel,
  type GraphEntityCollections,
} from '../services/mindGraph';
import {
  MIND_NODE_STATUSES,
  MIND_NODE_TYPES,
  MIND_RELATIONSHIP_TYPES,
  type EntityReference,
  type GraphEntityType,
  type Level,
  type MindEdge,
  type MindNode,
  type MindNodeType,
  type MindRelationshipType,
} from '../types/models';

const newNode = (): MindNode => ({
  ...baseRecord(),
  title: '',
  type: 'knowledge',
  description: '',
  notes: '',
  status: 'active',
  confidence: 50,
  importance: 50,
});

const newEdge = (source?: EntityReference): MindEdge => ({
  ...baseRecord(),
  source: source ?? { entityType: 'mindNode', entityId: '' },
  target: { entityType: 'mindNode', entityId: '' },
  relationshipType: 'related to',
  notes: '',
});

const referenceValue = (reference: EntityReference) =>
  `${reference.entityType}:${reference.entityId}`;
const parseReference = (value: string): EntityReference => {
  const [entityType, ...idParts] = value.split(':');
  return { entityType: entityType as GraphEntityType, entityId: idParts.join(':') };
};
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function MindPage() {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | MindNodeType>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodeEdit, setNodeEdit] = useState<MindNode | null>(null);
  const [edgeEdit, setEdgeEdit] = useState<MindEdge | null>(null);
  const [edgeError, setEdgeError] = useState('');
  const data = useLiveQuery(async () => {
    const [mindNodes, mindEdges, skills, resources, capabilities, todos, activities] =
      await Promise.all([
        db.mindNodes.toArray(),
        db.mindEdges.toArray(),
        db.skills.toArray(),
        db.resources.toArray(),
        db.capabilities.toArray(),
        db.todos.toArray(),
        db.activities.toArray(),
      ]);
    return {
      mindNodes,
      mindEdges,
      skills,
      resources,
      capabilities,
      todos,
      activities,
    } satisfies GraphEntityCollections & { mindEdges: MindEdge[] };
  }, []);
  const nodes = data?.mindNodes ?? [];
  const activeNodes = nodes.filter((node) => !node.archived);
  const visibleNodes = activeNodes.filter((node) => {
    const needle = query.trim().toLowerCase();
    return (
      (typeFilter === 'all' || node.type === typeFilter) &&
      (!needle ||
        `${node.title} ${node.description} ${node.notes} ${node.tags.join(' ')}`
          .toLowerCase()
          .includes(needle))
    );
  });
  const selected = activeNodes.find((node) => node.id === selectedId) ?? visibleNodes[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const references = useMemo(() => {
    if (!data) return [];
    const groups: Array<{
      type: GraphEntityType;
      records: Array<{ id: string; label: string; archived: boolean }>;
    }> = [
      {
        type: 'mindNode',
        records: data.mindNodes.map((item) => ({
          id: item.id,
          label: item.title,
          archived: item.archived,
        })),
      },
      {
        type: 'skill',
        records: data.skills.map((item) => ({
          id: item.id,
          label: item.name,
          archived: item.archived,
        })),
      },
      {
        type: 'resource',
        records: data.resources.map((item) => ({
          id: item.id,
          label: item.name,
          archived: item.archived,
        })),
      },
      {
        type: 'capability',
        records: data.capabilities.map((item) => ({
          id: item.id,
          label: item.name,
          archived: item.archived,
        })),
      },
      {
        type: 'todo',
        records: data.todos.map((item) => ({
          id: item.id,
          label: item.title,
          archived: item.archived,
        })),
      },
      {
        type: 'activity',
        records: data.activities.map((item) => ({
          id: item.id,
          label: item.title,
          archived: item.archived,
        })),
      },
    ];
    return groups.map((group) => ({
      ...group,
      records: group.records.filter((record) => !record.archived),
    }));
  }, [data]);

  const connected =
    selected && data
      ? connectedMindEdges({ entityType: 'mindNode', entityId: selected.id }, data.mindEdges, data)
      : [];
  const selectedKey = selected ? `mindNode:${selected.id}` : '';
  const incoming = connected.filter(({ edge }) => referenceValue(edge.target) === selectedKey);
  const outgoing = connected.filter(({ edge }) => referenceValue(edge.source) === selectedKey);

  return (
    <Page
      title="Mind map"
      subtitle="Connect who you are, what you know, and where you are going. Forge stores meaning—not screen coordinates."
      action={<button onClick={() => setNodeEdit(newNode())}>Add node</button>}
    >
      <div className="mind-layout">
        <Card className="mind-browser">
          <div className="form-grid">
            <Field label="Search mind nodes">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title, notes, or tags"
              />
            </Field>
            <Field label="Node type">
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as 'all' | MindNodeType)}
              >
                <option value="all">All types</option>
                {MIND_NODE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {titleCase(type)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mind-node-list" aria-label="Mind nodes">
            {visibleNodes.map((node) => (
              <button
                type="button"
                className={selected?.id === node.id ? 'mind-node selected' : 'mind-node'}
                aria-pressed={selected?.id === node.id}
                key={node.id}
                onClick={() => setSelectedId(node.id)}
              >
                <span className={`mind-type type-${node.type}`}>
                  {node.customType || node.type}
                </span>
                <strong>{node.title}</strong>
                <small>{node.status}</small>
              </button>
            ))}
            {!visibleNodes.length && (
              <p className="muted">
                No nodes match this search. Add only what you actually believe or know.
              </p>
            )}
          </div>
        </Card>

        <div className="mind-main">
          {selected && data ? (
            <>
              <Card className="mind-focus">
                <div className="mind-focus-heading">
                  <div>
                    <p className="eyebrow">{selected.customType || selected.type}</p>
                    <h2>{selected.title}</h2>
                  </div>
                  <div className="actions">
                    <button className="secondary" onClick={() => setNodeEdit({ ...selected })}>
                      Edit
                    </button>
                    <button
                      className="danger"
                      onClick={async () => {
                        if (
                          !confirm(
                            'Archive this mind node? Its relationships remain preserved but will be hidden while the node is archived.',
                          )
                        )
                          return;
                        await db.mindNodes.update(selected.id, {
                          archived: true,
                          updatedAt: now(),
                        });
                        setSelectedId(null);
                      }}
                    >
                      Archive
                    </button>
                  </div>
                </div>
                <p>{selected.description || 'No description yet.'}</p>
                {selected.notes && <p className="muted">{selected.notes}</p>}
                <div className="mind-metrics">
                  <span>Confidence {selected.confidence}%</span>
                  <span>Importance {selected.importance}%</span>
                  <span>Status {selected.status}</span>
                  {selected.familiarityLevel !== undefined && (
                    <span>Understanding {selected.familiarityLevel}/5</span>
                  )}
                  {selected.practicalLevel !== undefined && (
                    <span>Practical {selected.practicalLevel}/5</span>
                  )}
                </div>
              </Card>

              <Card>
                <div className="mind-focus-heading">
                  <div>
                    <p className="eyebrow">FOCUSED BRANCH</p>
                    <h2>Connections</h2>
                  </div>
                  <button
                    onClick={() =>
                      setEdgeEdit(newEdge({ entityType: 'mindNode', entityId: selected.id }))
                    }
                  >
                    Connect record
                  </button>
                </div>
                <div className="mind-graph" aria-label={`Connections for ${selected.title}`}>
                  <div className="mind-column">
                    <h3>Points here</h3>
                    {incoming.map(({ edge, source }) => (
                      <button
                        type="button"
                        className="graph-entity"
                        key={edge.id}
                        onClick={() =>
                          source?.reference.entityType === 'mindNode' &&
                          setSelectedId(source.reference.entityId)
                        }
                      >
                        <strong>{source?.label}</strong>
                        <small>{relationshipLabel(edge)} →</small>
                      </button>
                    ))}
                    {!incoming.length && <p className="muted">No incoming relationships.</p>}
                  </div>
                  <div className="mind-column center">
                    <span className={`mind-type type-${selected.type}`}>
                      {selected.customType || selected.type}
                    </span>
                    <strong>{selected.title}</strong>
                  </div>
                  <div className="mind-column">
                    <h3>Points outward</h3>
                    {outgoing.map(({ edge, target }) => (
                      <button
                        type="button"
                        className="graph-entity"
                        key={edge.id}
                        onClick={() =>
                          target?.reference.entityType === 'mindNode' &&
                          setSelectedId(target.reference.entityId)
                        }
                      >
                        <small>→ {relationshipLabel(edge)}</small>
                        <strong>{target?.label}</strong>
                      </button>
                    ))}
                    {!outgoing.length && <p className="muted">No outgoing relationships.</p>}
                  </div>
                </div>
                {connected.length > 0 && (
                  <div className="mind-edge-list">
                    {connected.map(({ edge, source, target }) => (
                      <div className="record-row" key={edge.id}>
                        <div>
                          <strong>
                            {source?.label} → {relationshipLabel(edge)} → {target?.label}
                          </strong>
                          {edge.notes && <p className="muted">{edge.notes}</p>}
                        </div>
                        <div className="actions">
                          <button className="secondary" onClick={() => setEdgeEdit({ ...edge })}>
                            Edit
                          </button>
                          <button
                            className="danger subtle"
                            onClick={async () => {
                              if (
                                !confirm(
                                  'Archive this relationship? It remains in exported history.',
                                )
                              )
                                return;
                              await db.mindEdges.update(edge.id, {
                                archived: true,
                                updatedAt: now(),
                              });
                            }}
                          >
                            Archive
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <DocumentEvidence ownerType="mindNode" ownerId={selected.id} saved={true} />
              </Card>
            </>
          ) : (
            <Card>
              <h2>Start with one honest node</h2>
              <p className="muted">
                Add a value, belief, knowledge concept, question, or custom node. Forge will not
                invent a self-description or predefined technology tree for you.
              </p>
              <button onClick={() => setNodeEdit(newNode())}>Add the first node</button>
            </Card>
          )}
        </div>
      </div>

      {nodeEdit && (
        <Modal
          title={nodes.some((node) => node.id === nodeEdit.id) ? 'Edit mind node' : 'Add mind node'}
          onClose={() => setNodeEdit(null)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const timestamp = now();
              await db.mindNodes.put({
                ...nodeEdit,
                title: nodeEdit.title.trim(),
                customType: nodeEdit.type === 'custom' ? nodeEdit.customType?.trim() : undefined,
                description: nodeEdit.description.trim(),
                notes: nodeEdit.notes.trim(),
                tags: nodeEdit.tags.map((tag) => tag.trim()).filter(Boolean),
                updatedAt: timestamp,
              });
              setSelectedId(nodeEdit.id);
              setNodeEdit(null);
            }}
          >
            <div className="form-grid">
              <Field label="Title">
                <input
                  required
                  value={nodeEdit.title}
                  onChange={(event) => setNodeEdit({ ...nodeEdit, title: event.target.value })}
                />
              </Field>
              <Field label="Node type">
                <select
                  value={nodeEdit.type}
                  onChange={(event) =>
                    setNodeEdit({ ...nodeEdit, type: event.target.value as MindNodeType })
                  }
                >
                  {MIND_NODE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {titleCase(type)}
                    </option>
                  ))}
                </select>
              </Field>
              {nodeEdit.type === 'custom' && (
                <Field label="Custom type name">
                  <input
                    required
                    value={nodeEdit.customType ?? ''}
                    onChange={(event) =>
                      setNodeEdit({ ...nodeEdit, customType: event.target.value })
                    }
                  />
                </Field>
              )}
              <Field label="Status">
                <select
                  value={nodeEdit.status}
                  onChange={(event) =>
                    setNodeEdit({ ...nodeEdit, status: event.target.value as MindNode['status'] })
                  }
                >
                  {MIND_NODE_STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </Field>
              <Field label="Confidence (0–100)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={nodeEdit.confidence}
                  onChange={(event) =>
                    setNodeEdit({ ...nodeEdit, confidence: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Importance (0–100)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={nodeEdit.importance}
                  onChange={(event) =>
                    setNodeEdit({ ...nodeEdit, importance: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Understanding level (optional)">
                <select
                  value={nodeEdit.familiarityLevel ?? ''}
                  onChange={(event) =>
                    setNodeEdit({
                      ...nodeEdit,
                      familiarityLevel:
                        event.target.value === ''
                          ? undefined
                          : (Number(event.target.value) as Level),
                    })
                  }
                >
                  <option value="">Not assessed</option>
                  {[0, 1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Practical level (optional)">
                <select
                  value={nodeEdit.practicalLevel ?? ''}
                  onChange={(event) =>
                    setNodeEdit({
                      ...nodeEdit,
                      practicalLevel:
                        event.target.value === ''
                          ? undefined
                          : (Number(event.target.value) as Level),
                    })
                  }
                >
                  <option value="">Not assessed</option>
                  {[0, 1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea
                value={nodeEdit.description}
                onChange={(event) => setNodeEdit({ ...nodeEdit, description: event.target.value })}
              />
            </Field>
            <Field label="Notes, nuance, evidence, or counterevidence">
              <textarea
                value={nodeEdit.notes}
                onChange={(event) => setNodeEdit({ ...nodeEdit, notes: event.target.value })}
              />
            </Field>
            <Field label="Tags (comma separated)">
              <input
                value={nodeEdit.tags.join(', ')}
                onChange={(event) =>
                  setNodeEdit({ ...nodeEdit, tags: event.target.value.split(',') })
                }
              />
            </Field>
            <div className="actions">
              <button>Save node</button>
              <button type="button" className="secondary" onClick={() => setNodeEdit(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {edgeEdit && data && (
        <Modal
          title={
            data.mindEdges.some((edge) => edge.id === edgeEdit.id)
              ? 'Edit relationship'
              : 'Connect records'
          }
          onClose={() => {
            setEdgeEdit(null);
            setEdgeError('');
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const candidate = {
                ...edgeEdit,
                customRelationship:
                  edgeEdit.relationshipType === 'custom'
                    ? edgeEdit.customRelationship?.trim()
                    : undefined,
                notes: edgeEdit.notes.trim(),
                updatedAt: now(),
              };
              const issues = mindEdgeIntegrityIssues(candidate, data, data.mindEdges);
              if (issues.length) {
                setEdgeError(issues.join(' '));
                return;
              }
              await db.mindEdges.put(candidate);
              setEdgeEdit(null);
              setEdgeError('');
            }}
          >
            <Field label="Source">
              <select
                required
                value={referenceValue(edgeEdit.source)}
                onChange={(event) =>
                  setEdgeEdit({ ...edgeEdit, source: parseReference(event.target.value) })
                }
              >
                <option value="mindNode:">Choose a source</option>
                {references.map((group) => (
                  <optgroup label={titleCase(group.type)} key={group.type}>
                    {group.records.map((record) => (
                      <option
                        key={`${group.type}:${record.id}`}
                        value={`${group.type}:${record.id}`}
                      >
                        {record.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Relationship">
              <select
                value={edgeEdit.relationshipType}
                onChange={(event) =>
                  setEdgeEdit({
                    ...edgeEdit,
                    relationshipType: event.target.value as MindRelationshipType,
                  })
                }
              >
                {MIND_RELATIONSHIP_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </Field>
            {edgeEdit.relationshipType === 'custom' && (
              <Field label="Custom relationship label">
                <input
                  required
                  value={edgeEdit.customRelationship ?? ''}
                  onChange={(event) =>
                    setEdgeEdit({ ...edgeEdit, customRelationship: event.target.value })
                  }
                />
              </Field>
            )}
            <Field label="Target">
              <select
                required
                value={referenceValue(edgeEdit.target)}
                onChange={(event) =>
                  setEdgeEdit({ ...edgeEdit, target: parseReference(event.target.value) })
                }
              >
                <option value="mindNode:">Choose a target</option>
                {references.map((group) => (
                  <optgroup label={titleCase(group.type)} key={group.type}>
                    {group.records.map((record) => (
                      <option
                        key={`${group.type}:${record.id}`}
                        value={`${group.type}:${record.id}`}
                      >
                        {record.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Relationship notes">
              <textarea
                value={edgeEdit.notes}
                onChange={(event) => setEdgeEdit({ ...edgeEdit, notes: event.target.value })}
              />
            </Field>
            {edgeError && (
              <p className="error" role="alert">
                {edgeError}
              </p>
            )}
            <div className="actions">
              <button>Save relationship</button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEdgeEdit(null);
                  setEdgeError('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Page>
  );
}
