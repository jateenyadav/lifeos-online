import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BrainCircuit,
  CalendarDays,
  Dumbbell,
  Heart,
  Leaf,
  LogOut,
  NotebookPen,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import useWorkspace from './workspaces/useWorkspace.js';
import Today from './workspaces/Today.jsx';
import Notes from './workspaces/Notes.jsx';
import Workouts from './workspaces/Workouts.jsx';
import Routines from './workspaces/Routines.jsx';
import Spending from './workspaces/Spending.jsx';
import PersonalAi from './workspaces/PersonalAi.jsx';
import './workspaces/workspaces.css';

const spaces = [
  { id: 'today', title: 'Today', icon: CalendarDays, component: Today },
  {
    id: 'notes',
    title: 'Notes & reminders',
    icon: NotebookPen,
    component: Notes,
  },
  {
    id: 'workouts',
    title: 'Workout tracker',
    icon: Dumbbell,
    component: Workouts,
  },
  { id: 'routines', title: 'Daily routines', icon: Heart, component: Routines },
  {
    id: 'spending',
    title: 'Spending tracker',
    icon: Wallet,
    component: Spending,
  },
  { id: 'ai', title: 'Personal AI', icon: BrainCircuit, component: PersonalAi },
];
const readRoute = () => {
  const [space, action] = window.location.hash.slice(1).split('/');
  return {
    space: spaces.some((entry) => entry.id === space) ? space : 'today',
    action,
  };
};

export default function Dashboard({
  user,
  busy,
  error,
  onLogout,
  onSessionExpired,
}) {
  const [route, setRoute] = useState(readRoute);
  const store = useWorkspace(onSessionExpired);
  const activeSpace = spaces.find((space) => space.id === route.space);
  const Space = activeSpace.component;
  useEffect(() => {
    const changed = () => {
      setRoute(readRoute());
      window.scrollTo?.({ top: 0 });
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <a className="workspace-brand" href="#today">
          <span>
            <Leaf size={23} />
          </span>
          lifeOS<span className="brand-period">.</span>
        </a>
        <p className="sidebar-caption">A PLACE FOR YOUR EVERYDAY</p>
        <nav aria-label="Workspaces">
          {spaces.map((space) => {
            const Icon = space.icon;
            return (
              <a
                key={space.id}
                href={`#${space.id}`}
                aria-current={route.space === space.id ? 'page' : undefined}
              >
                <Icon size={19} />
                <span>{space.title}</span>
                {route.space === space.id && <span className="nav-dot" />}
              </a>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <Leaf size={18} />
          <strong>A little, every day.</strong>
          <p>Your spaces are here whenever you need them.</p>
          <a href="#today">
            Back to your day <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="sidebar-account">
          <span className="user-initial">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          <button
            className="space-icon-button"
            aria-label={busy ? 'Signing out…' : 'Sign out'}
            title="Sign out"
            disabled={busy}
            onClick={onLogout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <span>Your space</span>
            <span>/</span>
            <strong>{activeSpace.title}</strong>
          </div>
          <div>
            <time dateTime={new Date().toISOString()}>
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </time>
            <button
              className="space-icon-button"
              aria-label="Refresh saved spaces"
              title="Refresh saved spaces"
              disabled={store.loading || store.saving}
              onClick={store.reload}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        <div className="workspace-content">
          {(store.data.payments ?? []).some(
            (entry) => entry.status === 'pending',
          ) &&
            route.space !== 'spending' && (
              <div className="payment-review-banner" role="status">
                <strong>A new payment is ready to review.</strong>
                <a href="#spending">Check payment details</a>
              </div>
            )}
          {(error || store.error) && (
            <div className="workspace-error" role="alert">
              <span>{error || store.error}</span>
              {!store.loading && (
                <button onClick={store.reload} disabled={store.saving}>
                  <RefreshCw size={15} /> Retry loading
                </button>
              )}
            </div>
          )}
          {store.notice && (
            <p className="workspace-notice" role="status">
              {store.notice}
            </p>
          )}
          {store.loading ? (
            <div className="workspace-loading" role="status">
              <Leaf size={26} />
              <h2>Making a little room…</h2>
              <p>Loading your saved spaces.</p>
            </div>
          ) : store.loaded ? (
            <Space
              key={`${route.space}/${route.action || ''}`}
              store={store}
              user={user}
              create={route.action === 'new'}
              onSessionExpired={onSessionExpired}
            />
          ) : (
            <div className="workspace-loading">
              <h2>Your saved spaces could not load.</h2>
              <p>
                Use Retry loading. Your saved entries have not been changed.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
