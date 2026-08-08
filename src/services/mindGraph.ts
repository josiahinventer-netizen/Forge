import type {
  Activity,
  Capability,
  EntityReference,
  MindEdge,
  MindNode,
  Resource,
  Skill,
  Todo,
} from '../types/models';

export interface GraphEntityCollections {
  mindNodes: readonly MindNode[];
  skills: readonly Skill[];
  resources: readonly Resource[];
  capabilities: readonly Capability[];
  todos: readonly Todo[];
  activities: readonly Activity[];
}

export interface ResolvedEntityReference {
  reference: EntityReference;
  label: string;
  archived: boolean;
}

const referenceKey = (reference: EntityReference) =>
  `${reference.entityType}:${reference.entityId}`;

export function resolveEntityReference(
  reference: EntityReference,
  collections: GraphEntityCollections,
): ResolvedEntityReference | null {
  const record =
    reference.entityType === 'mindNode'
      ? collections.mindNodes.find((item) => item.id === reference.entityId)
      : reference.entityType === 'skill'
        ? collections.skills.find((item) => item.id === reference.entityId)
        : reference.entityType === 'resource'
          ? collections.resources.find((item) => item.id === reference.entityId)
          : reference.entityType === 'capability'
            ? collections.capabilities.find((item) => item.id === reference.entityId)
            : reference.entityType === 'todo'
              ? collections.todos.find((item) => item.id === reference.entityId)
              : collections.activities.find((item) => item.id === reference.entityId);
  if (!record) return null;
  return {
    reference,
    label: 'title' in record ? record.title : record.name,
    archived: record.archived,
  };
}

export function mindEdgeIntegrityIssues(
  edge: Pick<MindEdge, 'id' | 'source' | 'target' | 'relationshipType' | 'customRelationship'>,
  collections: GraphEntityCollections,
  edges: readonly MindEdge[] = [],
): string[] {
  const issues: string[] = [];
  const source = resolveEntityReference(edge.source, collections);
  const target = resolveEntityReference(edge.target, collections);
  if (!source) issues.push('The source record does not exist.');
  else if (source.archived) issues.push('The source record is archived.');
  if (!target) issues.push('The target record does not exist.');
  else if (target.archived) issues.push('The target record is archived.');
  if (referenceKey(edge.source) === referenceKey(edge.target))
    issues.push('A relationship must connect two different records.');
  if (edge.source.entityType !== 'mindNode' && edge.target.entityType !== 'mindNode')
    issues.push('At least one side of a mind relationship must be a mind node.');
  if (edge.relationshipType === 'custom' && !edge.customRelationship?.trim())
    issues.push('A custom relationship needs a label.');
  const duplicate = edges.find(
    (candidate) =>
      candidate.id !== edge.id &&
      !candidate.archived &&
      referenceKey(candidate.source) === referenceKey(edge.source) &&
      referenceKey(candidate.target) === referenceKey(edge.target) &&
      candidate.relationshipType === edge.relationshipType &&
      (candidate.customRelationship?.trim().toLowerCase() ?? '') ===
        (edge.customRelationship?.trim().toLowerCase() ?? ''),
  );
  if (duplicate) issues.push('This relationship already exists.');
  return issues;
}

export function connectedMindEdges(
  reference: EntityReference,
  edges: readonly MindEdge[],
  collections: GraphEntityCollections,
) {
  const key = referenceKey(reference);
  return edges
    .filter(
      (edge) =>
        !edge.archived && (referenceKey(edge.source) === key || referenceKey(edge.target) === key),
    )
    .map((edge) => ({
      edge,
      source: resolveEntityReference(edge.source, collections),
      target: resolveEntityReference(edge.target, collections),
    }))
    .filter((item) => item.source && item.target && !item.source.archived && !item.target.archived);
}

export function relationshipLabel(edge: MindEdge) {
  return edge.relationshipType === 'custom'
    ? edge.customRelationship?.trim() || 'custom relationship'
    : edge.relationshipType;
}
