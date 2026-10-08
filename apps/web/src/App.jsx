import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  Monitor,
  Smartphone,
  Sparkles,
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

function StoryPanel() {
  return (
    <section className="story-panel" aria-label="About LifeOS">
      <div className="story-content">
        <span className="eyebrow">
          <span className="status-dot" /> YOUR LIFE, A LITTLE LIGHTER
        </span>
        <h1>
          Make room for
          <br />
          what <em>matters.</em>
        </h1>
        <p className="story-description">
          A calmer place to bring your life together.
          <br className="desktop-break" /> One account, wherever your day takes
          you.
        </p>
        <div className="illustration" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="floating-note">
            <Sparkles size={16} />
            <span>A little more balance</span>
          </div>
          <div className="preview-card">
            <div className="preview-top">
              <span className="preview-leaf">
                <Leaf size={18} />
              </span>
              <span>YOUR SPACE</span>
              <span className="preview-dots">•••</span>
            </div>
            <p className="preview-greeting">Hello, new beginnings.</p>
            <p className="preview-subtitle">
              Good things start with a little space.
            </p>
            <div className="preview-mood">
              <span>☀</span>
              <div>
                <strong>A fresh start</strong>
                <small>One step at a time</small>
              </div>
              <ChevronRight size={16} />
            </div>
            <div className="preview-row">
              <span className="mini-check">
                <Check size={12} />
              </span>
              <span>Show up for yourself</span>
              <span className="preview-tag">TODAY</span>
            </div>
            <div className="preview-row">
              <span className="mini-check empty" />
              <span>Leave room to grow</span>
            </div>
            <div className="preview-progress">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="floating-device">
            <Smartphone size={20} />
            <div>
              <strong>Always with you</strong>
              <small>Web · Android · iOS</small>
            </div>
            <span className="device-check">
              <Check size={12} />
            </span>
          </div>
          <span className="tiny-spark spark-one">✧</span>
          <span className="tiny-spark spark-two">✧</span>
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
          <span>One connected experience</span>
        </div>
      </div>
      <p className="story-footnote">
        A small beginning. A world of possibilities.
      </p>
    </section>
  );
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

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [error]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest('/auth/me', { signal: controller.signal })
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
              {error && (
                <div className="error-message" role="alert" ref={errorRef}>
                  {error}
                </div>
              )}
              {restoring && (
                <p className="session-note" role="status">
                  Checking your session…
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
