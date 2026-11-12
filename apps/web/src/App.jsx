import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  Check,
  Dumbbell,
  Eye,
  EyeOff,
  Heart,
  Leaf,
  LockKeyhole,
  Monitor,
  NotebookPen,
  Smartphone,
  Sparkles,
  Sun,
  Wallet,
} from 'lucide-react';
import { apiRequest } from './api.js';
import GoogleButton from './GoogleButton.jsx';
import Dashboard from './Dashboard.jsx';

function Brand() {
  return (
    <a className="brand" href="/" aria-label="LifeOS home">
      <span className="brand-icon">
        <Leaf size={22} strokeWidth={1.7} />
      </span>
      <span>
        life<span className="brand-os">OS</span>
        <span className="brand-dot">.</span>
      </span>
    </a>
  );
}

const previewSpaces = [
  { id: 'notes', label: 'Notes & reminders', icon: NotebookPen },
  { id: 'workouts', label: 'Workouts', icon: Dumbbell },
  { id: 'routines', label: 'Routines', icon: Heart },
  { id: 'spending', label: 'Spending', icon: Wallet },
  { id: 'ai', label: 'Personal AI', icon: BrainCircuit },
];

function SpaceChips({ className = '' }) {
  return (
    <ul className={`space-chips ${className}`} aria-label="What is inside">
      {previewSpaces.map(({ id, label, icon: Icon }) => (
        <li key={id} data-space={id}>
          <Icon size={15} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}

function StoryPanel() {
  return (
    <section className="story-panel" aria-label="About LifeOS">
      <div className="story-content">
        <span className="eyebrow">
          <span className="status-dot" /> YOUR EVERYDAY, IN ONE CALM PLACE
        </span>
        <h1>
          Make room for
          <br />
          what <em>matters.</em>
        </h1>
        <p className="story-description">
          Notes, workouts, routines, spending and a personal AI that turns a
          sentence into an entry. One account for web, Android and iOS.
        </p>
        <SpaceChips />
        <div className="illustration" aria-hidden="true">
          <span className="preview-label">Preview · sample data</span>
          <div className="preview-card preview-today">
            <div className="preview-hero">
              <div>
                <small>YOUR DAY, A LITTLE LIGHTER</small>
                <strong>
                  Hello, there<span>.</span>
                </strong>
              </div>
              <span className="preview-sun">
                <Sun size={22} />
              </span>
            </div>
            <div className="preview-stats">
              <div className="preview-stat" data-space="routines">
                <svg viewBox="0 0 36 36" className="preview-ring">
                  <circle cx="18" cy="18" r="14" />
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    pathLength="100"
                    strokeDasharray="67 100"
                  />
                </svg>
                <div>
                  <b>2 / 3</b>
                  <small>Routines done</small>
                </div>
              </div>
              <div className="preview-stat" data-space="workouts">
                <div className="preview-dots">
                  {[1, 0, 1, 1, 0, 1, 0].map((on, index) => (
                    <i key={index} className={on ? 'on' : ''} />
                  ))}
                </div>
                <div>
                  <b>4 sessions</b>
                  <small>Last 7 days</small>
                </div>
              </div>
            </div>
            <div className="preview-row">
              <span className="mini-check">
                <Check size={12} />
              </span>
              <span>Drink 8 glasses of water</span>
              <span className="preview-tag">Water</span>
            </div>
            <div className="preview-row">
              <span className="mini-check empty" />
              <span>Night skin care</span>
              <span className="preview-tag">Evening</span>
            </div>
          </div>
          <div className="floating-note preview-spend" data-space="spending">
            <span className="preview-spend-head">
              <Wallet size={14} /> This month
            </span>
            <strong>₹6,848.50</strong>
            <span className="preview-bar">
              <i data-cat="Shopping" style={{ width: '51%' }} />
              <i data-cat="Food" style={{ width: '25%' }} />
              <i data-cat="Bills" style={{ width: '12%' }} />
              <i data-cat="Travel" style={{ width: '7%' }} />
              <i data-cat="Health" style={{ width: '5%' }} />
            </span>
          </div>
          <div className="floating-device preview-tell" data-space="ai">
            <span className="preview-tell-head">
              <Sparkles size={14} /> Tell LifeOS
            </span>
            <p className="preview-bubble you">Spent 250 on lunch</p>
            <p className="preview-bubble ai">
              Add expense: Lunch, ₹250 (Food)?
            </p>
            <span className="preview-save">
              <Check size={12} /> Save
            </span>
          </div>
        </div>
        <div className="platform-list">
          <span>
            <Monitor size={15} /> Web
          </span>
          <span>
            <Smartphone size={15} /> Android
          </span>
          <span>
            <Smartphone size={15} /> iOS
          </span>
          <span className="platform-divider" />
          <span>One account, one place for your day</span>
        </div>
      </div>
      <p className="story-footnote">
        A small beginning. A world of possibilities.
      </p>
    </section>
  );
}

// The free hosted backend sleeps when idle and can take up to a minute to wake.
// A proxy in front of it may give up first with a gateway error (502/503/504),
// so the session check keeps retrying those until the server answers.
const WAKE_NOTICE_MS = 5000;
const WAKE_RETRY_MS = 3000;
const WAKE_LIMIT_MS = 90000;
const GATEWAY_ERRORS = new Set([502, 503, 504]);

const pause = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

async function restoreSession(signal) {
  const started = Date.now();
  for (;;) {
    try {
      return await apiRequest('/auth/me', { signal });
    } catch (failure) {
      if (
        signal.aborted ||
        !GATEWAY_ERRORS.has(failure.status) ||
        Date.now() - started >= WAKE_LIMIT_MS
      )
        throw failure;
      await pause(WAKE_RETRY_MS, signal);
    }
  }
}

export default function App() {
  const contentRef = useRef(null);
  const errorRef = useRef(null);
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [error]);

  const waiting = restoring || busy;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaking(true), WAKE_NOTICE_MS);
    return () => {
      clearTimeout(timer);
      setWaking(false);
    };
  }, [waiting]);

  useEffect(() => {
    const controller = new AbortController();
    restoreSession(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setUser(result.user);
      })
      .catch((failure) => {
        if (!controller.signal.aborted && failure.status !== 401)
          setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRestoring(false);
      });
    return () => controller.abort();
  }, []);

  const authenticate = useCallback(async (path, body) => {
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest(path, { method: 'POST', body });
      setUser(result.user);
      setPassword('');
      setConfirmPassword('');
      setRegistering(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }, []);
  const googleLogin = useCallback(
    (idToken) => {
      void authenticate('/auth/google', { idToken });
    },
    [authenticate],
  );
  const googleError = useCallback((message) => setError(message), []);

  async function submit(event) {
    event.preventDefault();
    if (busy || restoring) return;
    if (!identifier.trim() || !password)
      return setError('Enter your ID/email and password.');
    if (new TextEncoder().encode(password).length > 72)
      return setError('Password must be at most 72 bytes.');
    if (registering) {
      if (!name.trim()) return setError('Enter your name.');
      if (password.length < 8)
        return setError('Password must be at least 8 characters.');
      if (password !== confirmPassword)
        return setError('Passwords do not match.');
      return authenticate('/auth/register', {
        name: name.trim(),
        email: identifier.trim(),
        password,
        confirmPassword,
      });
    }
    await authenticate('/auth/login', {
      identifier: identifier.trim(),
      password,
    });
  }

  function switchMode() {
    setRegistering(!registering);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    contentRef.current?.scrollIntoView?.({ block: 'start' });
  }

  async function logout() {
    setBusy(true);
    setError('');
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function sessionExpired() {
    setUser(null);
    setError('Your session has expired. Please sign in again.');
  }

  if (user)
    return (
      <Dashboard
        key={user.id}
        user={user}
        busy={busy}
        error={error}
        onLogout={logout}
        onAccountDeleted={() => {
          setUser(null);
          setError('');
        }}
        onSessionExpired={sessionExpired}
      />
    );

  return (
    <main className="app-shell">
      <header className="app-header">
        <Brand />
        <span className="header-note">
          A little more life. A little less noise.
        </span>
        <span className="header-badge">
          <span className="status-dot" /> YOUR PERSONAL SPACE
        </span>
      </header>
      {
        <div className="main-grid">
          <StoryPanel />
          <section className="login-panel" aria-label="Account sign-in">
            <div className="login-content" ref={contentRef}>
              <div className="welcome-icon">
                <Leaf size={25} strokeWidth={1.5} />
              </div>
              <span className="eyebrow login-eyebrow">
                {registering
                  ? 'MAKE A LITTLE SPACE FOR YOURSELF'
                  : 'LET’S PICK UP WHERE YOU LEFT OFF'}
              </span>
              <h2>{registering ? 'A fresh start.' : 'Welcome back.'}</h2>
              <p className="login-description">
                {registering
                  ? 'Create one account for web, Android, and iOS.'
                  : 'Your space is waiting. Come on in.'}
              </p>
              <SpaceChips className="login-chips" />
              {error && (
                <div className="error-message" role="alert" ref={errorRef}>
                  {error}
                </div>
              )}
              {waiting && (restoring || waking) && (
                <p className="session-note" role="status">
                  {waking
                    ? 'Waking up the server, this can take up to a minute…'
                    : 'Checking your session…'}
                </p>
              )}
              <>
                <form
                  onSubmit={submit}
                  aria-label={
                    registering ? 'Email registration' : 'Password login'
                  }
                >
                  {registering && (
                    <>
                      <label htmlFor="name">Your name</label>
                      <input
                        id="name"
                        name="name"
                        autoComplete="name"
                        placeholder="Enter your name"
                        maxLength={100}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        disabled={busy || restoring}
                        required
                      />
                    </>
                  )}
                  <label
                    htmlFor="identifier"
                    className={registering ? 'password-label' : undefined}
                  >
                    {registering ? 'Email address' : 'Your ID or email'}
                  </label>
                  <input
                    id="identifier"
                    name="identifier"
                    type={registering ? 'email' : 'text'}
                    autoComplete={registering ? 'email' : 'username'}
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={
                      registering
                        ? 'Enter your email'
                        : 'Enter your ID or email'
                    }
                    maxLength={254}
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    disabled={busy || restoring}
                    required
                  />
                  <label htmlFor="password" className="password-label">
                    Password
                  </label>
                  <div className="password-field">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={
                        registering ? 'new-password' : 'current-password'
                      }
                      placeholder={
                        registering
                          ? 'At least 8 characters'
                          : 'Enter your password'
                      }
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={busy || restoring}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      aria-pressed={showPassword}
                      disabled={busy || restoring}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {registering && (
                    <>
                      <label
                        htmlFor="confirm-password"
                        className="password-label"
                      >
                        Confirm password
                      </label>
                      <input
                        id="confirm-password"
                        name="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Enter your password again"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        disabled={busy || restoring}
                        required
                      />
                      <p className="session-help">
                        Use at least 8 characters. Maximum 72 bytes.
                      </p>
                    </>
                  )}
                  <p className="session-help">
                    <LockKeyhole size={12} /> Your session stays private on this
                    device.
                  </p>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={busy || restoring}
                  >
                    {busy
                      ? registering
                        ? 'Creating your account…'
                        : 'Signing you in…'
                      : registering
                        ? 'Create account'
                        : 'Sign in'}
                    <ArrowRight size={18} />
                  </button>
                </form>
                <div className="auth-demo-block">
                  <button
                    type="button"
                    className="auth-demo"
                    onClick={() => authenticate('/auth/demo')}
                    disabled={busy || restoring}
                  >
                    <Sparkles size={18} aria-hidden="true" />
                    Just looking? Try the demo, no sign-up
                  </button>
                  <p>
                    A private sample account. It is deleted within 24 hours.
                  </p>
                </div>
                <button
                  type="button"
                  className="auth-switch"
                  onClick={switchMode}
                  disabled={busy || restoring}
                >
                  {registering
                    ? 'Already have an account? Sign in'
                    : 'New here? Create account'}
                </button>
                <div className="divider">
                  <span />
                  or keep it simple
                  <span />
                </div>
                <GoogleButton
                  onCredential={googleLogin}
                  onError={googleError}
                  disabled={busy || restoring}
                />
                <p className="access-note">
                  Google creates your account on your first sign-in.
                </p>
              </>
              <div className="secure-note">
                <LockKeyhole size={13} />
                <span>A secure start to something good.</span>
              </div>
            </div>
            <footer className="login-footer">
              <span>MADE FOR YOUR EVERYDAY</span>
              <span>LifeOS · First chapter</span>
            </footer>
          </section>
        </div>
      }
    </main>
  );
}
