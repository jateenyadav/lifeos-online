import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Send, Sparkles, Trash2, User } from 'lucide-react';
import { apiRequest } from '../api.js';
import { Field, SpaceHeading } from './shared.jsx';
import TellLifeOS from './TellLifeOS.jsx';
import './personal-ai.css';

const labels = {
  workouts: 'Workouts',
  routines: 'Daily routines & skin care',
  spending: 'Money',
};

export default function PersonalAi({ onSessionExpired, aiStatus }) {
  const [lifeos, setLifeos] = useState(aiStatus ?? null);
  const [consent, setConsent] = useState(false);
  const [topics, setTopics] = useState(Object.keys(labels));
  const [documents, setDocuments] = useState([]);
  const [draft, setDraft] = useState({
    title: '',
    topic: 'workouts',
    content: '',
  });
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(true);
  const locked = useRef(false);
  const expired = useRef(onSessionExpired);
  useEffect(() => {
    expired.current = onSessionExpired;
  }, [onSessionExpired]);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    Promise.all([
      apiRequest('/ai/status', { signal: controller.signal }),
      apiRequest('/ai/knowledge', { signal: controller.signal }),
    ])
      .then(([result, knowledge]) => {
        if (controller.signal.aborted) return;
        setLifeos(result.lifeos ?? null);
        setDocuments(knowledge.documents);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError(failure.message);
          if (failure.status === 401) expired.current?.();
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      active.current = false;
      controller.abort();
    };
  }, []);

  async function perform(action) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (failure) {
      if (active.current) {
        setError(failure.message);
        if (failure.status === 401) expired.current?.();
      }
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }

  function changeTopic(value) {
    setTopics((previous) =>
      previous.includes(value)
        ? previous.filter((topic) => topic !== value)
        : [...previous, value],
    );
    setConsent(false);
    setMessages([]);
  }
  function ask(event) {
    event.preventDefault();
    if (!topics.length || !question.trim() || !consent) return;
    const body = {
      provider: 'lifeos',
      topics,
      question: question.trim(),
      cloudConsent: true,
      history: messages.slice(-6).map((entry) => ({
        role: entry.role,
        content: entry.content.slice(0, 1000),
      })),
    };
    perform(async () => {
      const result = await apiRequest('/ai/chat', { method: 'POST', body });
      if (!active.current) return;
      setMessages((previous) => [
        ...previous,
        { role: 'user', content: body.question },
        { role: 'assistant', content: result.answer, ...result },
      ]);
      setQuestion('');
      if (typeof result.remainingToday === 'number')
        setLifeos((previous) =>
          previous
            ? { ...previous, remaining: result.remainingToday }
            : previous,
        );
    });
  }
  function saveKnowledge(event) {
    event.preventDefault();
    perform(async () => {
      const result = await apiRequest('/ai/knowledge', {
        method: 'POST',
        body: draft,
      });
      if (!active.current) return;
      setDocuments((previous) => [result.document, ...previous]);
      setDraft({ title: '', topic: draft.topic, content: '' });
      setMessages([]);
      setNotice(
        'Saved in your database. Your next question can use this knowledge.',
      );
    });
  }
  async function importText(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name) || file.size > 40000) {
      setError('Choose a small .txt or .md file. Maximum 10,000 characters.');
      return;
    }
    try {
      const content = await file.text();
      if (!active.current) return;
      if (content.length > 10000) {
        setError('Use at most 10,000 characters per knowledge entry.');
        return;
      }
      setDraft((previous) => ({
        ...previous,
        title:
          previous.title || file.name.replace(/\.(txt|md)$/i, '').slice(0, 120),
        content,
      }));
    } catch {
      if (active.current)
        setError('Could not read this file. Paste the text instead.');
    }
  }

  return (
    <>
      <SpaceHeading
        eyebrow="YOUR PERSONAL KNOWLEDGE"
        title="Personal AI"
        description="Ask about your workouts, routines, skin care and money. LifeOS AI is free and needs no key."
      />
      <div className="ai-intro">
        <BrainCircuit size={23} />
        <p>
          <strong>Your data, not a new training job.</strong> The AI reads your
          latest saved records and relevant knowledge for each question. It does
          not retrain its model. Notes and chats are not used to change model
          weights.
        </p>
      </div>
      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="workspace-notice" role="status">
          {notice}
        </p>
      )}
      {lifeos?.available && <TellLifeOS onSessionExpired={onSessionExpired} />}
      <div className="ai-layout">
        <section className="ai-card">
          <h2>
            <BrainCircuit size={20} aria-hidden="true" /> Talk to your AI
          </h2>
          {loading && <p role="status">Loading your AI space…</p>}
          <form onSubmit={ask}>
            <fieldset disabled={busy || loading} className="ai-controls">
              <div className="ai-status">
                <p>
                  Free cloud models run by LifeOS. Up to{' '}
                  {lifeos?.dailyLimit ?? 30} questions a day
                  {typeof lifeos?.remaining === 'number'
                    ? `, ${lifeos.remaining} left today`
                    : ''}
                  .
                </p>
              </div>
              <p className="ai-warning">
                LifeOS AI sends your question, recent chat, and the selected
                data excerpts to free AI providers (Groq or Google Gemini) to
                write the answer.
              </p>
              <div className="ai-topics">
                <strong>Data the AI may read</strong>
                {Object.entries(labels).map(([topic, label]) => (
                  <label key={topic}>
                    <input
                      type="checkbox"
                      checked={topics.includes(topic)}
                      onChange={() => changeTopic(topic)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="ai-check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                I agree to send the selected data and chat to LifeOS AI.
              </label>
              <Field label="Your question">
                <textarea
                  required
                  maxLength={2000}
                  rows={3}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="What skin care routines have I saved?"
                />
              </Field>
              <div className="ai-examples">
                {[
                  'Summarize my workouts.',
                  'What skin care routines have I saved?',
                  'Where did I spend most this month?',
                ].map((text) => (
                  <button
                    type="button"
                    key={text}
                    onClick={() => setQuestion(text)}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <button
                className="space-primary"
                disabled={!question.trim() || !topics.length || !consent}
              >
                <Send size={16} />
                {busy ? 'AI is thinking...' : 'Ask AI'}
              </button>
            </fieldset>
          </form>
          {busy && (
            <p role="status">Working… this usually takes a few seconds.</p>
          )}
          <div
            className="ai-chat"
            aria-live="polite"
            aria-label="AI conversation"
          >
            {messages.map((entry, index) => (
              <article className={`ai-message ${entry.role}`} key={index}>
                <span className="ai-avatar" aria-hidden="true">
                  {entry.role === 'user' ? (
                    <User size={15} />
                  ) : (
                    <Sparkles size={15} />
                  )}
                </span>
                <strong>
                  {entry.role === 'user'
                    ? 'You'
                    : `LifeOS AI${entry.model ? ` · ${entry.model}` : ''}`}
                </strong>
                <p>{entry.content}</p>
                {entry.sources && (
                  <details>
                    <summary>
                      Data provided to the AI ({entry.sources.length} sources)
                    </summary>
                    <ul>
                      {entry.sources.map((source) => (
                        <li key={source.label}>
                          [{source.label}] {source.title} ({source.kind})
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {entry.limited && (
                  <p>
                    Only the latest 2,000 entries per data type were scanned.
                  </p>
                )}
              </article>
            ))}
          </div>
          <button
            type="button"
            className="space-secondary"
            disabled={busy || !messages.length}
            onClick={() => {
              setMessages([]);
              setConsent(false);
            }}
          >
            Clear chat
          </button>
          <p className="ai-footnote">
            Chat disappears when you leave. AI can be wrong. Check the sources.
            This is not medical or financial advice.
          </p>
        </section>
        <section className="ai-card">
          <h2>Add your own knowledge</h2>
          <p>
            Save your gym plan, skin care details, or spending rules. Your
            trackers are already included. Up to 100 entries.
          </p>
          <form onSubmit={saveKnowledge}>
            <fieldset disabled={busy || loading} className="ai-controls">
              <Field label="Knowledge title">
                <input
                  required
                  maxLength={120}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </Field>
              <Field label="Knowledge topic">
                <select
                  value={draft.topic}
                  onChange={(event) =>
                    setDraft({ ...draft, topic: event.target.value })
                  }
                >
                  {Object.entries(labels).map(([topic, label]) => (
                    <option key={topic} value={topic}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Knowledge text">
                <textarea
                  required
                  rows={7}
                  maxLength={10000}
                  value={draft.content}
                  onChange={(event) =>
                    setDraft({ ...draft, content: event.target.value })
                  }
                  placeholder="Paste your own plan or product notes here."
                />
              </Field>
              <Field label="Import text file (.txt or .md)">
                <input
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  onChange={importText}
                />
              </Field>
              <button className="space-primary">Save knowledge</button>
            </fieldset>
          </form>
          <div className="ai-documents">
            {documents.length === 0 && (
              <p>No extra knowledge yet. Saved tracker data still works.</p>
            )}
            {documents.map((entry) => (
              <article key={entry.id}>
                <div>
                  <strong>{entry.title}</strong>
                  <small>{labels[entry.topic]}</small>
                </div>
                <button
                  type="button"
                  className="space-icon-button"
                  aria-label={`Delete knowledge ${entry.title}`}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete knowledge "${entry.title}"?`))
                      perform(async () => {
                        await apiRequest(`/ai/knowledge/${entry.id}`, {
                          method: 'DELETE',
                        });
                        if (active.current) {
                          setDocuments((previous) =>
                            previous.filter(
                              (document) => document.id !== entry.id,
                            ),
                          );
                          setMessages([]);
                        }
                      });
                  }}
                >
                  <Trash2 size={16} />
                </button>
                <details>
                  <summary>Read saved text</summary>
                  <p>{entry.content}</p>
                </details>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
