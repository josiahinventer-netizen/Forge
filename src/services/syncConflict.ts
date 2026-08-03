import type { SyncConflictRecord } from './sync';

export interface ConflictFieldDifference {
  field: string;
  current: string;
  preserved: string;
}

const hiddenFields = new Set(['dataUrl', 'photoDataUrls']);

const displayValue = (value: unknown): string => {
  if (value === undefined) return 'Not set';
  if (value === null) return 'None';
  if (typeof value === 'string') return value || 'Empty';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

export function conflictDisplayName(conflict: SyncConflictRecord): string {
  const source = conflict.current?.payload ?? conflict.incomingPayload;
  if (source) {
    for (const field of ['name', 'title', 'fileName']) {
      if (typeof source[field] === 'string' && source[field]) return source[field];
    }
  }
  return conflict.recordId;
}

export function conflictDifferences(conflict: SyncConflictRecord): ConflictFieldDifference[] {
  const current = conflict.current?.payload ?? {};
  const preserved = conflict.incomingPayload ?? {};
  const fields = new Set([...Object.keys(current), ...Object.keys(preserved)]);
  return [...fields]
    .filter((field) => field !== 'updatedAt' && !hiddenFields.has(field))
    .filter((field) => JSON.stringify(current[field]) !== JSON.stringify(preserved[field]))
    .sort()
    .map((field) => ({
      field,
      current: displayValue(current[field]),
      preserved: displayValue(preserved[field]),
    }));
}
