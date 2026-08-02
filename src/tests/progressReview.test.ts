import { describe, expect, it } from 'vitest';
import { buildProgressReview } from '../services/progressReview';
import type { Activity, Capability, EvidenceAttachment, Resource, Skill } from '../types/models';

const base = {
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  tags: [],
  archived: false,
};
const skill: Skill = {
  ...base,
  id: 'repair',
  name: 'Repair',
  description: '',
  category: 'Making',
  knowledgeLevel: 2,
  practicalLevel: 1,
  confidence: 50,
  evidenceNotes: '',
  evidenceLinks: [],
};
const resource: Resource = {
  ...base,
  id: 'tool',
  name: 'Tool kit',
  description: '',
  category: 'Tools',
  resourceType: 'Tool',
  quantity: 1,
  unit: 'item',
  condition: 'Good',
  location: '',
  notes: '',
};
const capability: Capability = {
  ...base,
  id: 'fix',
  name: 'Fix equipment',
  description: '',
  category: 'Repair',
  requiredSkills: [{ skillId: skill.id, minimumKnowledgeLevel: 2, minimumPracticalLevel: 2 }],
  requiredResources: [{ resourceId: resource.id, requiredQuantity: 1, unit: 'item' }],
};
const activity = (
  id: string,
  occurredAt: string,
  kind: Activity['skillPractice'][number]['kind'],
  minutes: number,
  verificationStatus: Activity['skillPractice'][number]['verificationStatus'] = 'Activity-supported',
): Activity => ({
  ...base,
  id,
  title: 'Repair practice',
  description: '',
  purpose: 'Become able to repair equipment',
  occurredAt,
  durationMinutes: minutes,
  outcome: 'Diagnosed fault',
  reflection: '',
  skillPractice: [{ skillId: skill.id, kind, minutes, verificationStatus, notes: '' }],
  linkedResourceIds: [resource.id],
  linkedCapabilityIds: [capability.id],
  linkedTodoIds: [],
});
const attachment: EvidenceAttachment = {
  ...base,
  id: 'photo',
  ownerType: 'activity',
  ownerId: 'recent-practice',
  kind: 'Project result',
  fileName: 'result.jpg',
  mimeType: 'image/jpeg',
  byteSize: 3,
  width: 1,
  height: 1,
  sha256: 'a'.repeat(64),
  dataUrl: 'data:image/jpeg;base64,YWJj',
  verificationStatus: 'Activity-supported',
  notes: '',
};

describe('weekly progress review', () => {
  it('separates study from practical evidence and explains capability movement', () => {
    const review = buildProgressReview(
      [
        activity('recent-study', '2026-08-08T12:00:00.000Z', 'Study', 30),
        activity(
          'recent-practice',
          '2026-08-09T12:00:00.000Z',
          'Troubleshooting',
          45,
          'Needs review',
        ),
        activity('old', '2026-07-01T12:00:00.000Z', 'Independent application', 100),
      ],
      [skill],
      [capability],
      [resource],
      [attachment],
      new Date('2026-08-10T12:00:00.000Z'),
    );
    expect(review.activityCount).toBe(2);
    expect(review.totalActivityMinutes).toBe(75);
    expect(review.studyMinutes).toBe(30);
    expect(review.practicalMinutes).toBe(45);
    expect(review.photoEvidenceCount).toBe(1);
    expect(review.skills[0]).toEqual(
      expect.objectContaining({ skillName: 'Repair', totalMinutes: 75, practicalMinutes: 45 }),
    );
    expect(review.capabilities[0]?.assessment.status).toBe('Partially available');
    expect(review.suggestedReview).toBe('Review 1 evidence entry marked inferred or needs review.');
  });

  it('makes no progress claim when the period is empty', () => {
    const review = buildProgressReview(
      [],
      [skill],
      [capability],
      [resource],
      [],
      new Date('2026-08-10T12:00:00.000Z'),
    );
    expect(review.observations).toEqual(['No activities were logged in this period.']);
    expect(review.suggestedReview).toBe(
      'Log one meaningful activity with its purpose and observable outcome.',
    );
  });
});
