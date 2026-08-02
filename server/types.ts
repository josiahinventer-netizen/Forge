export const SYNC_ENTITY_TYPES = [
  'skill',
  'resource',
  'capability',
  'attachment',
  'todo',
  'activity',
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
