import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Card, Page } from '../components/UI';
import { db } from '../database/db';
import { assessCapability, rankClosestCapabilities } from '../services/capabilityAvailability';
import { buildProgressReview } from '../services/progressReview';

export function DashboardPage() {
  const counts = useLiveQuery(async () => {
    const [skills, resources, capabilities, todos, activities, attachments] = await Promise.all([
      db.skills.toArray(),
      db.resources.toArray(),
      db.capabilities.filter((capability) => !capability.archived).toArray(),
      db.todos.filter((todo) => !todo.archived).toArray(),
      db.activities.filter((activity) => !activity.archived).toArray(),
      db.attachments.filter((attachment) => !attachment.archived).toArray(),
    ]);
    const [activeSkills, archivedSkills, activeResources, archivedResources] = [
      skills.filter((skill) => !skill.archived).length,
      skills.filter((skill) => skill.archived).length,
      resources.filter((resource) => !resource.archived).length,
      resources.filter((resource) => resource.archived).length,
    ];
    const assessments = capabilities.map((capability) =>
      assessCapability(capability, skills, resources),
    );
    return {
      activeSkills,
      archivedSkills,
      activeResources,
      archivedResources,
      availableCapabilities: assessments.filter((assessment) => assessment.status === 'Available')
        .length,
      partialCapabilities: assessments.filter(
        (assessment) => assessment.status === 'Partially available',
      ).length,
      blockedCapabilities: assessments.filter((assessment) => assessment.status === 'Blocked')
        .length,
      openTodos: todos.filter((todo) => todo.status !== 'Completed').length,
      overdueTodos: todos.filter(
        (todo) => todo.status !== 'Completed' && todo.dueAt && Date.parse(todo.dueAt) < Date.now(),
      ).length,
      activities: activities.length,
      closest: rankClosestCapabilities(capabilities, skills, resources).slice(0, 3),
      review: buildProgressReview(activities, skills, capabilities, resources, attachments),
    };
  }, []);

  return (
    <Page
      title="Character dashboard"
      subtitle="A local-first foundation for recording skills and resources."
    >
      <div className="stats slice-stats">
        <Card>
          <b>{counts?.activeSkills ?? '—'}</b>
          <span>Active skills</span>
        </Card>
        <Card>
          <b>{counts?.activeResources ?? '—'}</b>
          <span>Active resources</span>
        </Card>
        <Card>
          <b>{(counts?.archivedSkills ?? 0) + (counts?.archivedResources ?? 0)}</b>
          <span>Archived records</span>
        </Card>
        <Card>
          <b>{counts?.availableCapabilities ?? '—'}</b>
          <span>Available capabilities</span>
        </Card>
        <Card>
          <b>{counts?.partialCapabilities ?? '—'}</b>
          <span>Partially available</span>
        </Card>
        <Card>
          <b>{counts?.blockedCapabilities ?? '—'}</b>
          <span>Blocked capabilities</span>
        </Card>
        <Card>
          <b>{counts?.openTodos ?? '—'}</b>
          <span>Open todos</span>
        </Card>
        <Card>
          <b>{counts?.overdueTodos ?? '—'}</b>
          <span>Overdue todos</span>
        </Card>
        <Card>
          <b>{counts?.activities ?? '—'}</b>
          <span>Logged activities</span>
        </Card>
      </div>
      <div className="dashboard-grid">
        <Card>
          <p className="eyebrow">CAPABILITY SYSTEM</p>
          <h2>Connect your baseline to real outcomes</h2>
          <p className="muted">
            Define what you want to build, repair, perform, produce, or teach. Forge checks every
            linked requirement against your current records.
          </p>
          <div className="actions">
            <Link className="button" to="/skills">
              Add a skill
            </Link>
            <Link className="button secondary" to="/resources">
              Add a resource
            </Link>
            <Link className="button secondary" to="/capabilities">
              View capabilities
            </Link>
            <Link className="button secondary" to="/todos">
              Plan a todo
            </Link>
            <Link className="button secondary" to="/activities">
              Log progress
            </Link>
          </div>
        </Card>
        <Card>
          <h2>Calculated, not claimed</h2>
          <p className="muted">
            Availability is recalculated from active skill levels and resource quantities. Every
            shortfall is shown in plain language; capability status is not stored as a score.
          </p>
        </Card>
        <Card>
          <h2>Closest capabilities</h2>
          {counts?.closest.length ? (
            counts.closest.map(({ capability, assessment }) => (
              <div key={capability.id} className="next">
                <strong>{capability.name}</strong>
                <p className="muted">
                  {assessment.metRequirementCount} of {assessment.totalRequirementCount}{' '}
                  requirements met.
                </p>
                <p>{assessment.recommendedStep}</p>
              </div>
            ))
          ) : (
            <p className="muted">Add capability requirements to see the nearest useful outcomes.</p>
          )}
        </Card>
        <Card className="weekly-review">
          <p className="eyebrow">LAST 7 DAYS</p>
          <h2>Explainable progress</h2>
          {counts?.review.activityCount ? (
            <>
              <div className="review-stats">
                <span>
                  <b>{counts.review.activityCount}</b> activities
                </span>
                <span>
                  <b>{counts.review.totalActivityMinutes}</b> total minutes
                </span>
                <span>
                  <b>{counts.review.practicalMinutes}</b> practical minutes
                </span>
                <span>
                  <b>{counts.review.photoEvidenceCount}</b> evidence photos
                </span>
              </div>
              {counts.review.skills.slice(0, 3).map((skill) => (
                <div className="next" key={skill.skillId}>
                  <strong>{skill.skillName}</strong>
                  <p className="muted">
                    {skill.totalMinutes} minutes recorded · {skill.practicalMinutes} practical
                  </p>
                </div>
              ))}
              {counts.review.observations.map((observation) => (
                <p key={observation}>{observation}</p>
              ))}
              <p className="evidence">
                <strong>Review suggestion:</strong> {counts.review.suggestedReview}
              </p>
            </>
          ) : (
            <>
              <p className="muted">No activity evidence has been logged in the last seven days.</p>
              <p>{counts?.review.suggestedReview}</p>
            </>
          )}
        </Card>
        {counts?.review.capabilities.length ? (
          <Card>
            <h2>Capabilities you worked toward</h2>
            {counts.review.capabilities.map((line) => (
              <div className="next" key={line.capabilityId}>
                <strong>{line.capabilityName}</strong>
                <p className="muted">
                  {line.linkedActivityCount} linked activit
                  {line.linkedActivityCount === 1 ? 'y' : 'ies'} ·{' '}
                  {line.assessment.metRequirementCount} of {line.assessment.totalRequirementCount}{' '}
                  requirements met · {line.assessment.status}
                </p>
                {line.assessment.recommendedStep && <p>{line.assessment.recommendedStep}</p>}
              </div>
            ))}
          </Card>
        ) : null}
      </div>
    </Page>
  );
}
