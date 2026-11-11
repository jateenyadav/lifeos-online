import { useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { apiRequest } from './api.js';
import GoogleButton from './GoogleButton.jsx';

/**
 * Permanently delete the account and every saved record (same API the Android app uses).
 * Password accounts confirm with their password; Google accounts confirm with Google again.
 */
export default function DeleteAccount({ user, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const google = user.provider === 'google';

  useEffect(() => {
    if (!open) return undefined;
    dialog.current?.querySelector('input')?.focus();
    const onKey = (event) => event.key === 'Escape' && !busy && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  async function remove(extra) {
    if (confirmation !== 'DELETE') {
      setError('Type DELETE in capital letters to confirm.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest('/auth/account', {
        method: 'DELETE',
        body: { confirmation, ...extra },
      });
      onDeleted();
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" className="delete-account-link" onClick={() => setOpen(true)}>
        Delete account
      </button>
    );

  return (
    <div className="delete-account-backdrop" role="presentation">
      <div
        ref={dialog}
        className="delete-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
      >
        <button
          type="button"
          className="space-icon-button delete-account-close"
          aria-label="Close"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          <X size={18} />
        </button>
        <h2 id="delete-account-title">Delete your account?</h2>
        <p>
          This permanently removes your account and everything you saved: notes, reminders,
          workouts, routines, spending, payments, trips and AI knowledge. It cannot be undone.
        </p>
        {error && (
          <p className="workspace-error" role="alert">
            {error}
          </p>
        )}
        <label className="delete-account-field">
          <span>
            Type <b className="delete-word">DELETE</b> to confirm
          </span>
          <input
            value={confirmation}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {google ? (
          <div className="delete-account-google">
            <p>Confirm it's you with Google:</p>
            <GoogleButton
              disabled={busy || confirmation !== 'DELETE'}
              onCredential={(idToken) => remove({ idToken })}
              onError={setError}
            />
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              remove({ password });
            }}
          >
            <label className="delete-account-field">
              Your password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button
              className="delete-account-confirm"
              disabled={busy || confirmation !== 'DELETE' || !password}
            >
              <Trash2 size={16} />
              {busy ? 'Deleting…' : 'Delete my account forever'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
