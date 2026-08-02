import type { Activity, PracticeKind, Skill, VerificationStatus } from '../types/models';

export interface SkillEvidenceSummary {
  activityCount: number;
  totalMinutes: number;
  practicalMinutes: number;
  byKind: Record<PracticeKind, number>;
  byVerification: Record<VerificationStatus, number>;
  lastPracticedAt?: string;
  observations: string[];
}

const kinds: PracticeKind[] = [
  'Study',
  'Guided practice',
  'Independent application',
  'Troubleshooting',
  'Teaching',
];
const statuses: VerificationStatus[] = [
  'Confirmed',
  'Document-supported',
  'Activity-supported',
  'Inferred',
  'Needs review',
];

export function summarizeSkillEvidence(
  skill: Skill,
  activities: readonly Activity[],
): SkillEvidenceSummary {
  const relevant = activities.filter(
    (activity) =>
      !activity.archived && activity.skillPractice.some((entry) => entry.skillId === skill.id),
  );
  const byKind = Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<PracticeKind, number>;
  const byVerification = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<
    VerificationStatus,
    number
  >;
  let totalMinutes = 0;
  for (const activity of relevant)
    for (const entry of activity.skillPractice.filter((item) => item.skillId === skill.id)) {
      byKind[entry.kind] += entry.minutes;
      byVerification[entry.verificationStatus] += 1;
      totalMinutes += entry.minutes;
    }
  const practicalMinutes = totalMinutes - byKind.Study;
  const latest = relevant
    .map((activity) => activity.occurredAt)
    .sort()
    .at(-1);
  const observations: string[] = [];
  if (!relevant.length) observations.push('No logged activity evidence yet.');
  if (byKind.Study)
    observations.push(
      `${byKind.Study} minutes of study recorded; study alone is not practical evidence.`,
    );
  if (byKind['Independent application'])
    observations.push(
      `${byKind['Independent application']} minutes of independent application recorded.`,
    );
  if (byKind.Troubleshooting)
    observations.push(`${byKind.Troubleshooting} minutes of troubleshooting recorded.`);
  if (byKind.Teaching) observations.push(`${byKind.Teaching} minutes of teaching recorded.`);
  return {
    activityCount: relevant.length,
    totalMinutes,
    practicalMinutes,
    byKind,
    byVerification,
    lastPracticedAt: latest,
    observations,
  };
}
