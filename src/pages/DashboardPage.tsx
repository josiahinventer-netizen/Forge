import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Card, Page } from '../components/UI';
import { db } from '../database/db';
import { assessCapability, rankClosestCapabilities } from '../services/capabilityAvailability';
import { compareProgressPeriods } from '../services/progressReview';
import { planToday } from '../services/todoPlanning';

export function DashboardPage() {
  const [reviewDays, setReviewDays] = useState<7 | 30 | 90>(7);
  const counts = useLiveQuery(async () => {
    const [
      skills,
      resources,
      capabilities,
      todos,
      activities,
      attachments,
      mindNodes,
      mindEdges,
      todoOccurrences,
    ] = await Promise.all([
      db.skills.toArray(),
      db.resources.toArray(),
      db.capabilities.filter((capability) => !capability.archived).toArray(),
      db.todos.filter((todo) => !todo.archived).toArray(),
      db.activities.filter((activity) => !activity.archived).toArray(),
      db.attachments.filter((attachment) => !attachment.archived).toArray(),
      db.mindNodes.filter((node) => !node.archived).toArray(),
      db.mindEdges.filter((edge) => !edge.archived).toArray(),
      db.todoOccurrences.orderBy('completedAt').reverse().toArray(),
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
      mindNodes: mindNodes.length,
      mindEdges: mindEdges.length,
      closest: rankClosestCapabilities(capabilities, skills, resources).slice(0, 3),
      reviewComparison: compareProgressPeriods(
        activities,
        skills,
        capabilities,
        resources,
        attachments,
        new Date(),
        reviewDays,
      ),
      todayPlan: planToday(todos, mindNodes, mindEdges),
      weeklyProgress: [
        ...todoOccurrences
          .filter((item) => Date.parse(item.completedAt) >= Date.now() - 7 * 86_400_000)
          .map((item) => ({
            id: item.id,
            title: item.title,
            at: item.completedAt,
            kind: 'Completed',
          })),
        ...activities
          .filter((item) => Date.parse(item.occurredAt) >= Date.now() - 7 * 86_400_000)
          .map((item) => ({
            id: item.id,
            title: item.title,
            at: item.occurredAt,
            kind: 'Activity',
          })),
      ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at)),
    };
  }, [reviewDays]);
  const review = counts?.reviewComparison.current;
  const today = counts?.todayPlan;

  return (
    <Page
      title="Character dashboard"
      subtitle="A local-first foundation for recording skills and resources."
    >
      <section className="today-view" aria-labelledby="today-heading">
        <div className="today-heading">
          <div>
            <p className="eyebrow">TODAY</p>
            <h2 id="today-heading">What actually moves me forward?</h2>
          </div>
          {today?.currentFocus.length ? (
            <span className="focus-chip">
              Focus: {today.currentFocus.map((item) => item.title).join(', ')}
            </span>
          ) : null}
        </div>
        <div className="today-actions">
          {today?.actionableNow.slice(0, 3).map((item, index) => (
            <Card key={item.todo.id} className={index === 0 ? 'primary-action' : ''}>
              <span className="rank">{index + 1}</span>
              <div>
                <h3>{item.todo.execution?.nextAction || item.todo.title}</h3>
                <p>{item.todo.purpose}</p>
                <p className="muted">Why now: {item.reasons.join(' · ')}</p>
                {item.todo.estimatedMinutes ? (
                  <small>About {item.todo.estimatedMinutes} minutes</small>
                ) : null}
              </div>
            </Card>
          ))}
          {today && today.actionableNow.length === 0 ? (
            <Card>
              <p>
                No work is explicitly actionable right now. Review waiting or blocked items instead
                of forcing activity.
              </p>
            </Card>
          ) : null}
        </div>
        <div className="execution-summary">
          <Link to="/todos">
            <strong>Waiting</strong>
            <span>{today?.waiting.length ?? 0} items</span>
          </Link>
          <Link to="/todos">
            <strong>Blocked</strong>
            <span>{today?.blocked.length ?? 0} items</span>
          </Link>
          <Link to="/todos">
            <strong>Upcoming</strong>
            <span>{today?.upcoming.length ?? 0} items</span>
          </Link>
          <Link to="/todos">
            <strong>Deferred</strong>
            <span>{today?.deferred.length ?? 0} items</span>
          </Link>
        </div>
        <Card className="today-progress">
          <div>
            <p className="eyebrow">PROGRESS</p>
            <strong>
              {counts?.weeklyProgress.length ?? 0} meaningful steps recorded this week
            </strong>
          </div>
          {counts?.weeklyProgress.slice(0, 3).map((item) => (
            <span key={`${item.kind}:${item.id}`}>
              {item.kind}: {item.title}
            </span>
          ))}
        </Card>
      </section>
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
        <Card>
          <b>{counts?.mindNodes ?? '—'}</b>
          <span>Mind nodes</span>
        </Card>
        <Card>
          <b>{counts?.mindEdges ?? '—'}</b>
          <span>Mind connections</span>
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
            <Link className="button secondary" to="/mind">
              Explore Mind
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
          <div className="review-heading">
            <p className="eyebrow">RECENT EVIDENCE</p>
            <div className="period-picker" aria-label="Progress review period">
              {([7, 30, 90] as const).map((days) => (
                <button
                  className={reviewDays === days ? '' : 'secondary'}
                  aria-pressed={reviewDays === days}
                  key={days}
                  onClick={() => setReviewDays(days)}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>
          <h2>Explainable progress</h2>
          {counts?.reviewComparison && (
            <div className="period-comparison">
              <strong>Compared with the previous {reviewDays} days</strong>
              {counts.reviewComparison.comparisons.map((comparison) => (
                <p className="muted" key={comparison}>
                  {comparison}
                </p>
              ))}
            </div>
          )}
          {review?.activityCount ? (
            <>
              <div className="review-stats">
                <span>
                  <b>{review.activityCount}</b> activities
                </span>
                <span>
                  <b>{review.totalActivityMinutes}</b> total minutes
                </span>
                <span>
                  <b>{review.practicalMinutes}</b> practical minutes
                </span>
                <span>
                  <b>{review.photoEvidenceCount}</b> evidence photos
                </span>
              </div>
              {review.skills.slice(0, 3).map((skill) => (
                <div className="next" key={skill.skillId}>
                  <strong>{skill.skillName}</strong>
                  <p className="muted">
                    {skill.totalMinutes} minutes recorded · {skill.practicalMinutes} practical
                  </p>
                </div>
              ))}
              {review.observations.map((observation) => (
                <p key={observation}>{observation}</p>
              ))}
              <p className="evidence">
                <strong>Review suggestion:</strong> {review.suggestedReview}
              </p>
            </>
          ) : (
            <>
              <p className="muted">
                No activity evidence has been logged in the last {reviewDays} days.
              </p>
              <p>{review?.suggestedReview}</p>
            </>
          )}
        </Card>
        {review?.capabilities.length ? (
          <Card>
            <h2>Capabilities you worked toward</h2>
            {review.capabilities.map((line) => (
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
