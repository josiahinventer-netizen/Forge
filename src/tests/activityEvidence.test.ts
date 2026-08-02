import { describe, expect, it } from 'vitest';
import { summarizeSkillEvidence } from '../services/activityEvidence';
import type { Activity, Skill } from '../types/models';

const skill: Skill = {
  id: 'carpentry',
  name: 'Carpentry',
  description: '',
  category: 'Construction',
  knowledgeLevel: 2,
  practicalLevel: 2,
  confidence: 50,
  evidenceNotes: '',
  evidenceLinks: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  tags: [],
  archived: false,
};
const activity = (
  id: string,
  kind: Activity['skillPractice'][number]['kind'],
  minutes: number,
  archived = false,
): Activity => ({
  id,
  title: 'Workbench work',
  description: '',
  purpose: 'Build useful furniture',
  occurredAt: `2026-01-0${id}T12:00:00Z`,
  durationMinutes: minutes,
  outcome: 'Cut and joined lumber',
  reflection: '',
  skillPractice: [
    { skillId: skill.id, kind, minutes, verificationStatus: 'Activity-supported', notes: '' },
  ],
  linkedResourceIds: [],
  linkedCapabilityIds: [],
  linkedTodoIds: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  tags: [],
  archived,
});

describe('skill evidence summaries', () => {
  it('separates passive study from practical evidence and ignores archived activity', () => {
    const result = summarizeSkillEvidence(skill, [
      activity('1', 'Study', 30),
      activity('2', 'Troubleshooting', 45),
      activity('3', 'Teaching', 20),
      activity('4', 'Independent application', 100, true),
    ]);
    expect(result.activityCount).toBe(3);
    expect(result.totalMinutes).toBe(95);
    expect(result.practicalMinutes).toBe(65);
    expect(result.byKind.Troubleshooting).toBe(45);
    expect(result.lastPracticedAt).toBe('2026-01-03T12:00:00Z');
    expect(result.observations).toContain(
      '30 minutes of study recorded; study alone is not practical evidence.',
    );
  });

  it('does not invent evidence when nothing is linked', () => {
    expect(summarizeSkillEvidence(skill, []).observations).toEqual([
      'No logged activity evidence yet.',
    ]);
  });
});
