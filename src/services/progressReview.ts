import type {
  Activity,
  Capability,
  EvidenceAttachment,
  PracticeKind,
  Resource,
  Skill,
  VerificationStatus,
} from '../types/models';
import { assessCapability, type CapabilityAssessment } from './capabilityAvailability';

export interface SkillProgressLine {
  skillId: string;
  skillName: string;
  totalMinutes: number;
  practicalMinutes: number;
  kinds: Partial<Record<PracticeKind, number>>;
}

export interface CapabilityProgressLine {
  capabilityId: string;
  capabilityName: string;
  linkedActivityCount: number;
  assessment: CapabilityAssessment;
}

export interface ProgressReview {
  periodStart: string;
  periodEnd: string;
  activityCount: number;
  totalActivityMinutes: number;
  studyMinutes: number;
  practicalMinutes: number;
  outcomeCount: number;
  photoEvidenceCount: number;
  verificationCounts: Partial<Record<VerificationStatus, number>>;
  skills: SkillProgressLine[];
  capabilities: CapabilityProgressLine[];
  observations: string[];
  suggestedReview: string;
}

export function buildProgressReview(
  activities: readonly Activity[],
  skills: readonly Skill[],
  capabilities: readonly Capability[],
  resources: readonly Resource[],
  attachments: readonly EvidenceAttachment[],
  periodEnd = new Date(),
  days = 7,
): ProgressReview {
  const end = periodEnd.getTime();
  const start = end - days * 24 * 60 * 60 * 1000;
  const relevant = activities.filter(
    (activity) =>
      !activity.archived &&
      Date.parse(activity.occurredAt) >= start &&
      Date.parse(activity.occurredAt) <= end,
  );
  const skillLines = new Map<string, SkillProgressLine>();
  const verificationCounts: Partial<Record<VerificationStatus, number>> = {};
  let studyMinutes = 0;
  let practicalMinutes = 0;
  for (const activity of relevant)
    for (const practice of activity.skillPractice) {
      if (practice.kind === 'Study') studyMinutes += practice.minutes;
      else practicalMinutes += practice.minutes;
      verificationCounts[practice.verificationStatus] =
        (verificationCounts[practice.verificationStatus] ?? 0) + 1;
      const line = skillLines.get(practice.skillId) ?? {
        skillId: practice.skillId,
        skillName:
          skills.find((skill) => skill.id === practice.skillId)?.name ??
          `Skill ${practice.skillId}`,
        totalMinutes: 0,
        practicalMinutes: 0,
        kinds: {},
      };
      line.totalMinutes += practice.minutes;
      if (practice.kind !== 'Study') line.practicalMinutes += practice.minutes;
      line.kinds[practice.kind] = (line.kinds[practice.kind] ?? 0) + practice.minutes;
      skillLines.set(practice.skillId, line);
    }
  const relevantIds = new Set(relevant.map((activity) => activity.id));
  const capabilityLines = capabilities
    .filter((capability) => !capability.archived)
    .map((capability) => ({
      capabilityId: capability.id,
      capabilityName: capability.name,
      linkedActivityCount: relevant.filter((activity) =>
        activity.linkedCapabilityIds.includes(capability.id),
      ).length,
      assessment: assessCapability(capability, skills, resources),
    }))
    .filter((line) => line.linkedActivityCount > 0)
    .sort(
      (a, b) =>
        b.linkedActivityCount - a.linkedActivityCount ||
        b.assessment.metRequirementCount - a.assessment.metRequirementCount,
    );
  const observations: string[] = [];
  if (!relevant.length) observations.push('No activities were logged in this period.');
  if (studyMinutes)
    observations.push(
      `${studyMinutes} minutes were study; study is reported separately from practical evidence.`,
    );
  if (practicalMinutes)
    observations.push(
      `${practicalMinutes} minutes of guided practice, independent application, troubleshooting, or teaching were recorded.`,
    );
  const troubleshooting = [...skillLines.values()].reduce(
    (sum, line) => sum + (line.kinds.Troubleshooting ?? 0),
    0,
  );
  const teaching = [...skillLines.values()].reduce(
    (sum, line) => sum + (line.kinds.Teaching ?? 0),
    0,
  );
  if (troubleshooting)
    observations.push(
      `${troubleshooting} minutes of troubleshooting provide higher-context practical evidence.`,
    );
  if (teaching)
    observations.push(
      `${teaching} minutes of teaching were recorded; teaching can expose gaps but does not automatically prove mastery.`,
    );
  const reviewCount =
    (verificationCounts.Inferred ?? 0) + (verificationCounts['Needs review'] ?? 0);
  const suggestedReview = !relevant.length
    ? 'Log one meaningful activity with its purpose and observable outcome.'
    : reviewCount
      ? `Review ${reviewCount} evidence entr${reviewCount === 1 ? 'y' : 'ies'} marked inferred or needs review.`
      : practicalMinutes
        ? 'Compare the practical evidence with current skill levels and decide whether any level deserves a manual, explained update.'
        : 'Add guided practice or independent application before considering practical level changes.';
  return {
    periodStart: new Date(start).toISOString(),
    periodEnd: new Date(end).toISOString(),
    activityCount: relevant.length,
    totalActivityMinutes: relevant.reduce((sum, activity) => sum + activity.durationMinutes, 0),
    studyMinutes,
    practicalMinutes,
    outcomeCount: relevant.filter((activity) => activity.outcome.trim()).length,
    photoEvidenceCount: attachments.filter(
      (attachment) =>
        !attachment.archived &&
        attachment.ownerType === 'activity' &&
        relevantIds.has(attachment.ownerId),
    ).length,
    verificationCounts,
    skills: [...skillLines.values()].sort(
      (a, b) =>
        b.practicalMinutes - a.practicalMinutes ||
        b.totalMinutes - a.totalMinutes ||
        a.skillName.localeCompare(b.skillName),
    ),
    capabilities: capabilityLines,
    observations,
    suggestedReview,
  };
}
