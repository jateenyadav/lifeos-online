import { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { apiRequest } from '../api.js';

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const labels = { expenses: 'Spending', notes: 'Notes & reminders', workouts: 'Workouts' };

/**
 * "Tell LifeOS": type what happened in plain words. The AI proposes ONE entry (or answers a
 * spending question); nothing is saved until you press Save.
 */
export default function TellLifeOS({ onSessionExpired }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  async function run(task) {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 401) onSessionExpired?.();
    } finally {
      setBusy(false);
    }
  }

  function ask(event) {
    event.preventDefault();
    if (!message.trim()) return;
    setSaved('');
    setProposal(null);
    run(async () => {
      const result = await apiRequest('/ai/act', { method: 'POST', body: { message: message.trim(), today: localToday() } });
      setReply(result.reply);
      setProposal(result.proposal ?? null);
    });
  }

  function save() {
    run(async () => {
      await apiRequest(`/workspaces/${proposal.collection}`, { method: 'POST', body: proposal.values });
      setSaved(`Saved to ${labels[proposal.collection] ?? 'your spaces'}.`);
      setProposal(null);
      setReply('');
      setMessage('');
    });
  }

  return (
    <section className="ai-card tell-lifeos" aria-labelledby="tell-lifeos-title">
      <h2 id="tell-lifeos-title">
        <Sparkles size={18} /> Tell LifeOS
      </h2>
      <p className="tell-lifeos-hint">
        Write it the way you'd say it. LifeOS turns it into an entry, and you check it before it's saved.
      </p>
      <form onSubmit={ask} className="tell-lifeos-form">
        <input
          value={message}
          maxLength={500}
          disabled={busy}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Spent 250 on lunch with Rahul yesterday"
          aria-label="Tell LifeOS what happened"
        />
        <button className="space-primary" disabled={busy || !message.trim()}>
          {busy ? 'Thinking…' : 'Go'}
        </button>
      </form>
      <div className="ai-examples">
        {['Spent 250 on lunch with Rahul yesterday', 'Remind me to pay rent on the 1st', 'Ran 5 km for 30 minutes today', 'How much did I spend on food this month?'].map((text) => (
          <button type="button" key={text} disabled={busy} onClick={() => setMessage(text)}>
            {text}
          </button>
        ))}
      </div>
      {error && <p className="workspace-error" role="alert">{error}</p>}
      {saved && <p className="workspace-notice" role="status">{saved}</p>}
      {reply && !proposal && <p className="tell-lifeos-reply" aria-live="polite">{reply}</p>}
      {proposal && (
        <div className="tell-lifeos-proposal" aria-live="polite">
          <p>{proposal.summary}</p>
          <div>
            <button type="button" className="space-primary" disabled={busy} onClick={save}>
              <Check size={16} /> Save
            </button>
            <button type="button" className="space-secondary" disabled={busy} onClick={() => { setProposal(null); setReply(''); }}>
              <X size={16} /> Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
