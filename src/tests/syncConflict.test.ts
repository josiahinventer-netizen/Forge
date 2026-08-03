import { describe, expect, it } from 'vitest';
import { conflictDifferences, conflictDisplayName } from '../services/syncConflict';
import type { SyncConflictRecord } from '../services/sync';

const conflict: SyncConflictRecord = {
  id: 1,
  entityType: 'resource',
  recordId: 'saw',
  incomingUpdatedAt: '2026-08-01T12:00:00.000Z',
  incomingDeleted: false,
  incomingPayload: { id: 'saw', name: 'Old saw', quantity: 1, dataUrl: 'private-image' },
  reason: 'stale update',
  recordedAt: '2026-08-02T12:00:00.000Z',
  resolvedAt: null,
  resolution: null,
  current: {
    entityType: 'resource',
    recordId: 'saw',
    updatedAt: '2026-08-02T12:00:00.000Z',
    deleted: false,
    payload: { id: 'saw', name: 'DeWalt saw', quantity: 2, dataUrl: 'other-image' },
  },
};

describe('sync conflict presentation', () => {
  it('names records and explains changed fields without exposing image data', () => {
    expect(conflictDisplayName(conflict)).toBe('DeWalt saw');
    expect(conflictDifferences(conflict)).toEqual([
      { field: 'name', current: 'DeWalt saw', preserved: 'Old saw' },
      { field: 'quantity', current: '2', preserved: '1' },
    ]);
  });

  it('explains a preserved deletion', () => {
    expect(
      conflictDifferences({ ...conflict, incomingDeleted: true, incomingPayload: null }),
    ).toEqual(
      expect.arrayContaining([{ field: 'name', current: 'DeWalt saw', preserved: 'Not set' }]),
    );
  });
});
