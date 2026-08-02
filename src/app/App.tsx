import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { DashboardPage } from '../pages/DashboardPage';
import { CapabilitiesPage, CapabilityDetailPage } from '../pages/CapabilitiesPage';
import { ResourcesPage } from '../pages/ResourcesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SkillsPage } from '../pages/SkillsPage';
import { TodosPage } from '../pages/TodosPage';
import { db } from '../database/db';
import { startAutomaticSync } from '../services/sync';

function AutomaticSync() {
  useEffect(() => {
    return startAutomaticSync(db);
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
          <Route path="todos" element={<TodosPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
