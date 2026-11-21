import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Dumbbell,
  Heart,
  LogOut,
  NotebookPen,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Wallet,
} from 'lucide-react';
import useWorkspace from './workspaces/useWorkspace.js';
import Today from './workspaces/Today.jsx';
import Notes from './workspaces/Notes.jsx';
import Workouts from './workspaces/Workouts.jsx';
import Routines from './workspaces/Routines.jsx';
import PersonalAi from './workspaces/PersonalAi.jsx';
import Money from './money/Money.jsx';
import './workspaces/workspaces.css';
import DeleteAccount from './DeleteAccount.jsx';
import { apiRequest } from './api.js';
import Avatar, { avatarPairs } from './ui/Avatar.jsx';
import { Sheet, Switch } from './ui/Sheet.jsx';
import { usePrefs, useTheme } from './ui/prefs.js';
import ThemeToggle, { themeIcons, themeNames } from './ui/ThemeToggle.jsx';
import Lumi from './ui/Lumi.jsx';

const spaces = [
  {
    id: 'today',
    title: 'Today',
    short: 'Today',
    icon: CalendarDays,
    component: Today,
  },
  {
    id: 'notes',
    title: 'Notes & reminders',
    short: 'Notes',
    icon: NotebookPen,
    component: Notes,
  },
  {
    id: 'workouts',
    title: 'Workout tracker',
    short: 'Workouts',
    icon: Dumbbell,
    component: Workouts,
  },
  {
    id: 'routines',
    title: 'Daily routines',
    short: 'Habits',
    icon: Heart,
    component: Routines,
  },
  {
    id: 'money',
    title: 'Money',
    short: 'Money',
    icon: Wallet,
    component: Money,
  },
  {
    id: 'ai',
    title: 'Personal AI',
    short: 'AI',
    icon: BrainCircuit,
    component: PersonalAi,
  },
];

/** "#money/khata/abc?x=1" → { space: 'money', path: ['khata','abc'], params }. Old #spending goes to #money. */
export function readRoute() {
  const raw = window.location.hash.slice(1);
  const [pathPart, search = ''] = raw.split('?');
  let [space, ...path] = pathPart.split('/').filter(Boolean);
  if (space === 'spending') {
    space = 'money';
    const next = `#money${path.length ? `/${path.join('/')}` : ''}${search ? `?${search}` : ''}`;
    window.history.replaceState(null, '', next);
  }
  const known = spaces.some((entry) => entry.id === space);
  return {
    space: known ? space : 'today',
    path: known ? path : [],
    action: known ? path[0] : undefined,
    params: new URLSearchParams(search),
  };
}

function SettingsPanel({ user, onClose, onAccountDeleted }) {
  const [prefs, setPref] = usePrefs();
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="settings">
        <fieldset className="segmented">
          <legend>Theme</legend>
          {['system', 'light', 'dark'].map((value) => {
            const Icon = themeIcons[value];
            return (
              <label key={value} data-checked={prefs.theme === value}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={prefs.theme === value}
                  onChange={() => setPref('theme', value)}
                />
                <Icon size={16} aria-hidden="true" />
                {themeNames[value]}
              </label>
            );
          })}
        </fieldset>
        <div className="settings-row">
          <Lumi mood="happy" size={52} />
          <Switch
            checked={prefs.lumi}
            onChange={(value) => setPref('lumi', value)}
            label="Show Lumi on Today"
            hint="The little helper with a daily tip."
          />
        </div>
        <Switch
          checked={prefs.motion}
          onChange={(value) => setPref('motion', value)}
          label="Animations"
          hint="Count-ups, Lumi floating and card lifts. Your device's reduce-motion setting always wins."
        />
        <fieldset className="avatar-picker">
          <legend>Avatar colours</legend>
          <div>
            {avatarPairs.map((_, index) => (
              <label
                key={index}
                data-checked={(user.avatar ?? prefs.avatar) === index}
              >
                <input
                  type="radio"
                  name="avatar"
                  className="sr-only"
                  checked={(user.avatar ?? prefs.avatar) === index}
                  onChange={() => setPref('avatar', index)}
                />
                <Avatar name={user.name} pair={index} size={40} />
                <span className="sr-only">Colour pair {index + 1}</span>
              </label>
            ))}
          </div>
          <small className="field-hint">Saved on this device.</small>
        </fieldset>
        {onAccountDeleted && (
          <div className="settings-danger">
            <strong>Delete account</strong>
            <p>Removes your account and everything in it.</p>
            <DeleteAccount user={user} onDeleted={onAccountDeleted} />
          </div>
        )}
      </div>
    </Sheet>
  );
}

function AvatarMenu({ user, busy, onLogout, onSettings }) {
  const [open, setOpen] = useState(false);
  const [prefs] = usePrefs();
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (
        event.type === 'keydown'
          ? event.key === 'Escape'
          : !box.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="avatar-menu" ref={box}>
      <button
        type="button"
        className="avatar-button"
        aria-label="Account menu"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Avatar
          name={user.name}
          pair={user.avatar ?? prefs.avatar}
          size={36}
          status
        />
      </button>
      {open && (
        <div className="menu" role="group" aria-label="Account">
          <div className="menu-who">
            <Avatar
              name={user.name}
              pair={user.avatar ?? prefs.avatar}
              size={44}
            />
            <div>
              <strong>{user.name}</strong>
              <small>
                {user.provider === 'demo' ? 'Demo account' : user.email}
              </small>
            </div>
          </div>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
          >
            <Settings size={16} aria-hidden="true" /> Settings
          </button>
          <button
            type="button"
            className="menu-item"
            aria-label={busy ? 'Signing out…' : 'Sign out'}
            disabled={busy}
            onClick={onLogout}
          >
            <LogOut size={16} aria-hidden="true" />{' '}
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}

function GlobalSearch({ store, visibleSpaces }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const term = text.trim().toLowerCase();
  const results = useMemo(() => {
    if (!term) return [];
    const hit = (value) =>
      String(value ?? '')
        .toLowerCase()
        .includes(term);
    return [
      ...visibleSpaces
        .filter((space) => hit(space.title))
        .map((space) => ({
          href: `#${space.id}`,
          label: space.title,
          kind: 'Space',
        })),
      ...store.data.notes
        .filter((note) => hit(note.title) || hit(note.body))
        .slice(0, 4)
        .map((note) => ({ href: '#notes', label: note.title, kind: 'Note' })),
      ...store.data.routines
        .filter((routine) => hit(routine.title))
        .slice(0, 3)
        .map((routine) => ({
          href: '#routines',
          label: routine.title,
          kind: 'Routine',
        })),
      ...store.data.workouts
        .filter((workout) => hit(workout.title))
        .slice(0, 3)
        .map((workout) => ({
          href: '#workouts',
          label: workout.title,
          kind: 'Workout',
        })),
      {
        href: `#money/txns?q=${encodeURIComponent(text.trim())}`,
        label: `Search payments for “${text.trim()}”`,
        kind: 'Money',
      },
    ];
  }, [term, text, store.data, visibleSpaces]);
  const go = (href) => {
    window.location.hash = href;
    setText('');
    setOpen(false);
  };
  return (
    <div
      className="global-search"
      onBlur={(event) =>
        !event.currentTarget.contains(event.relatedTarget) && setOpen(false)
      }
    >
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        aria-label="Search LifeOS"
        placeholder="Search notes, habits, payments…"
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && results[0]) go(results[0].href);
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((result, index) => (
            <li key={`${result.href}-${index}`}>
              <a href={result.href} onClick={() => go(result.href)}>
                <span>{result.label}</span>
                <small>{result.kind}</small>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Dashboard({
  user,
  busy,
  error,
  onLogout,
  onAccountDeleted,
  onSessionExpired,
}) {
  useTheme();
  const [route, setRoute] = useState(readRoute);
  const [prefs, setPref] = usePrefs();
  const [settings, setSettings] = useState(false);
  const [ai, setAi] = useState(null);
  const store = useWorkspace(onSessionExpired);
  useEffect(() => {
    const changed = () => {
      setRoute(readRoute());
      window.scrollTo?.({ top: 0 });
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest('/ai/status', { signal: controller.signal })
      .then(
        (result) =>
          !controller.signal.aborted &&
          setAi(result?.lifeos ?? { available: false }),
      )
      .catch(() => !controller.signal.aborted && setAi({ available: false }));
    return () => controller.abort();
  }, []);
  const aiAvailable = ai?.available === true;
  const visibleSpaces = spaces.filter(
    (space) => space.id !== 'ai' || aiAvailable,
  );
  const showing = route.space === 'ai' && !aiAvailable ? 'today' : route.space;
  useEffect(() => {
    if (route.space === 'ai' && ai && !aiAvailable)
      window.history.replaceState(null, '', '#today');
  }, [route.space, ai, aiAvailable]);
  const activeSpace = spaces.find((space) => space.id === showing);
  const Space = activeSpace.component;
  const collapsed = prefs.sidebarCollapsed;

  return (
    <div
      className={`workspace-shell ${collapsed ? 'is-collapsed' : ''}`}
      data-space={showing}
    >
      <aside className="workspace-sidebar">
        <a
          className="workspace-brand"
          href="#today"
          aria-label="LifeOS, go to Today"
        >
          <span className="brand-mark" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <span className="brand-word">
            life<b>OS</b>
          </span>
        </a>
        <nav aria-label="Workspaces">
          {visibleSpaces.map((space) => {
            const Icon = space.icon;
            return (
              <a
                key={space.id}
                href={`#${space.id}`}
                data-space={space.id}
                aria-label={space.title}
                title={collapsed ? space.title : undefined}
                aria-current={showing === space.id ? 'page' : undefined}
              >
                <span className="nav-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="nav-label" aria-hidden="true">
                  {space.title}
                </span>
                <span className="nav-short" aria-hidden="true">
                  {space.short}
                </span>
              </a>
            );
          })}
        </nav>
        <button
          type="button"
          className="collapse-button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setPref('sidebarCollapsed', !collapsed)}
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          <span className="nav-label">Collapse</span>
        </button>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="topbar-title">
            <a className="topbar-brand" href="#today" aria-label="LifeOS home">
              <span className="brand-mark" aria-hidden="true">
                <Sparkles size={16} />
              </span>
            </a>
            <strong>{activeSpace.title}</strong>
          </div>
          <GlobalSearch store={store} visibleSpaces={visibleSpaces} />
          <div className="topbar-tools">
            <button
              type="button"
              className="icon-button"
              aria-label="Refresh saved spaces"
              title="Refresh saved spaces"
              disabled={store.loading || store.saving}
              onClick={store.reload}
            >
              <RefreshCw size={17} />
            </button>
            <ThemeToggle />
            <AvatarMenu
              user={user}
              busy={busy}
              onLogout={onLogout}
              onSettings={() => setSettings(true)}
            />
          </div>
        </header>
        <main className="workspace-content" id="main">
          {user.provider === 'demo' && (
            <p className="demo-banner" role="status">
              <Sparkles size={16} aria-hidden="true" />
              You're in a demo account with sample data. Try anything; it's
              deleted automatically within 24 hours.
            </p>
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
              <span className="sr-only">Loading your saved spaces.</span>
              <div className="skeleton skeleton-hero" aria-hidden="true" />
              <div className="skeleton-row" aria-hidden="true">
                <div className="skeleton skeleton-card" />
                <div className="skeleton skeleton-card" />
                <div className="skeleton skeleton-card" />
              </div>
              <div className="skeleton skeleton-list" aria-hidden="true" />
            </div>
          ) : store.loaded ? (
            <Space
              key={
                showing === 'money'
                  ? 'money'
                  : `${showing}/${route.action || ''}`
              }
              store={store}
              user={user}
              create={route.action === 'new'}
              path={
                showing === 'money' && route.action !== 'new' ? route.path : []
              }
              params={route.params}
              aiAvailable={aiAvailable}
              aiStatus={ai}
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
        </main>
      </div>
      {settings && (
        <SettingsPanel
          user={user}
          onClose={() => setSettings(false)}
          onAccountDeleted={onAccountDeleted}
        />
      )}
    </div>
  );
}
