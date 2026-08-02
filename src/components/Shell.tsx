import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { TodoReminder } from './TodoReminder';

const links: Array<[string, string, string]> = [
  ['/', '▦', 'Dashboard'],
  ['/skills', '⌁', 'Skills'],
  ['/resources', '▣', 'Resources'],
  ['/capabilities', '⚒', 'Capabilities'],
  ['/settings', '⚙', 'Data'],
];
links.splice(4, 0, ['/todos', '✓', 'Todos']);
links.splice(5, 0, ['/activities', '◉', 'Progress']);

export function Shell() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  }, []);

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <img src="/icon.svg" alt="" />
          <div>
            <strong>FORGE</strong>
            <small>Local character system</small>
          </div>
        </div>
        <nav aria-label="Primary navigation">
          {links.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={`network ${online ? 'online' : ''}`} role="status">
          <i />
          {online ? 'Online · local data' : 'Offline · local data'}
        </div>
      </aside>
      <div className="content">
        <TodoReminder />
        <Outlet />
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {links.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <span aria-hidden="true">{icon}</span>
            <small>{label}</small>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
