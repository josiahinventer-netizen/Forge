export const SYNC_ENTITY_TYPES = [
  'skill',
  'resource',
  'capability',
  'attachment',
  'documentEvidence',
  'todo',
  'activity',
  'todoOccurrence',
  'reminderEvent',
] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export interface SyncChangeInput {
  entityType: SyncEntityType;
  recordId: string;
  updatedAt: string;
  deleted: boolean;
  payload: Record<string, unknown> | null;
}

export interface SyncChange extends SyncChangeInput {
  revision: number;
}

export interface PushResult {
  accepted: number;
  ignored: number;
  conflictsPreserved: number;
  cursor: number;
}

export interface PullResult {
  changes: SyncChange[];
  cursor: number;
}

export interface ArchiveRecord {
  entityType: SyncEntityType;
  recordId: string;
  updatedAt: string;
  deleted: boolean;
  payload: Record<string, unknown> | null;
}

export type ConflictResolution = 'kept-current' | 'restored-preserved';

export interface SyncConflict {
  id: number;
  entityType: SyncEntityType;
  recordId: string;
  incomingUpdatedAt: string;
  incomingDeleted: boolean;
  incomingPayload: Record<string, unknown> | null;
  reason: string;
  recordedAt: string;
  resolvedAt: string | null;
  resolution: ConflictResolution | null;
  current: ArchiveRecord | null;
}
