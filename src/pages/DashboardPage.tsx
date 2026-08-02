import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Card, Page } from '../components/UI';
import { db } from '../database/db';
import { assessCapability } from '../services/capabilityAvailability';

export function DashboardPage() {
  const counts = useLiveQuery(async () => {
    const [skills, resources, capabilities] = await Promise.all([
      db.skills.toArray(),
      db.resources.toArray(),
      db.capabilities.filter((capability) => !capability.archived).toArray(),
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
          </div>
        </Card>
        <Card>
          <h2>Calculated, not claimed</h2>
          <p className="muted">
            Availability is recalculated from active skill levels and resource quantities. Every
            shortfall is shown in plain language; capability status is not stored as a score.
          </p>
        </Card>
      </div>
    </Page>
  );
}
