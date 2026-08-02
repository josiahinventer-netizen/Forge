import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { DashboardPage } from '../pages/DashboardPage';
import { CapabilitiesPage, CapabilityDetailPage } from '../pages/CapabilitiesPage';
import { ResourcesPage } from '../pages/ResourcesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SkillsPage } from '../pages/SkillsPage';
import { db } from '../database/db';
import { syncNow } from '../services/sync';

function AutomaticSync() {
  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      if (!active || !navigator.onLine || !(await db.syncSettings.get('primary'))) return;
      try {
        await syncNow();
      } catch {
        // The service records the visible error for Settings; offline use remains unaffected.
      }
    };
    void synchronize();
    const timer = window.setInterval(() => void synchronize(), 30_000);
    window.addEventListener('online', synchronize);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('online', synchronize);
    };
  }, []);
  return null;
}

export function App() {
  return (
    <>
      <AutomaticSync />
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<DashboardPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="capabilities" element={<CapabilitiesPage />} />
          <Route path="capabilities/:capabilityId" element={<CapabilityDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
