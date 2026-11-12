import { useEffect, useRef, useState } from 'react';
import {
  BrainCircuit,
  PowerOff,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { apiRequest } from '../api.js';
import { Field, SpaceHeading } from './shared.jsx';
import { cloudConnectionSafe } from './ai-utils.js';
import TellLifeOS from './TellLifeOS.jsx';
import './personal-ai.css';

const labels = {
  workouts: 'Workouts',
  routines: 'Daily routines & skin care',
  spending: 'Spending',
};
const emptyKeys = {
  apiKey: '',
  region: 'us-east-1',
  accessKeyId: '',
  secretAccessKey: '',
  sessionToken: '',
};

export default function PersonalAi({ onSessionExpired }) {
  const safeCloud = cloudConnectionSafe(
    window.location.href,
    import.meta.env.VITE_API_URL || '/api',
  );
  // "lifeos" = free cloud models with keys kept on the server (default when the server has keys).
  const [provider, setProvider] = useState('lifeos');
  const [lifeos, setLifeos] = useState(null);
  const byok = provider === 'openai' || provider === 'bedrock';
  const [models, setModels] = useState({
    local: 'llama3.2:3b',
    openai: 'gpt-4.1-mini',
    bedrock: '',
  });
  const [keys, setKeys] = useState(emptyKeys);
  const [consent, setConsent] = useState(false);
  const [topics, setTopics] = useState(Object.keys(labels));
  const [status, setStatus] = useState(null);
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
        setStatus(result.local);
        setLifeos(result.lifeos ?? null);
        if (!result.lifeos?.available) setProvider('local');
        setModels((previous) => ({ ...previous, local: result.defaultModel }));
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

  function changeProvider(value) {
    setProvider(value);
    setKeys(emptyKeys);
    setConsent(false);
    setMessages([]);
    setError('');
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
  function secretField(label, name, secret = true) {
    return (
      <Field label={label}>
        <input
          type={secret ? 'password' : 'text'}
          disabled={!safeCloud}
          autoComplete="off"
          spellCheck={false}
          required={name !== 'sessionToken'}
          value={keys[name]}
          onChange={(event) => setKeys({ ...keys, [name]: event.target.value })}
        />
      </Field>
    );
  }
  function ask(event) {
    event.preventDefault();
    if (byok && !safeCloud) {
      setError(
        'Cloud keys need an HTTPS page and backend, or a connection on this computer only. Use local AI here.',
      );
      return;
    }
    if (
      !topics.length ||
      !question.trim() ||
      (provider !== 'local' && !consent)
    )
      return;
    const body = {
      provider,
      ...(provider === 'lifeos' ? {} : { model: models[provider] }),
      topics,
      question: question.trim(),
      history: messages.slice(-6).map((entry) => ({
        role: entry.role,
        content: entry.content.slice(0, 1000),
      })),
    };
    if (provider === 'lifeos') body.cloudConsent = true;
    if (byok) {
      body.cloudConsent = true;
      body.credentials =
        provider === 'openai'
          ? { apiKey: keys.apiKey }
          : {
              region: keys.region,
              accessKeyId: keys.accessKeyId,
              secretAccessKey: keys.secretAccessKey,
              ...(keys.sessionToken ? { sessionToken: keys.sessionToken } : {}),
            };
    }
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
        description="Ask about your workouts, routines, skin care, and spending. LifeOS AI is free and needs no key. Local AI and your own keys are optional."
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
      {lifeos && !lifeos.available && (
        <div className="ai-off" role="note">
          <span className="ai-off-icon" aria-hidden="true">
            <PowerOff size={20} />
          </span>
          <div>
            <strong>LifeOS AI is switched off on this server.</strong>
            <p>
              The free cloud AI and Tell LifeOS need a server key that is not
              set yet. Everything else works. You can still ask with Local AI
              (Ollama) or your own key below.
            </p>
          </div>
        </div>
      )}
      <div className="ai-layout">
        <section className="ai-card">
          <h2>
            <BrainCircuit size={20} aria-hidden="true" /> Talk to your AI
          </h2>
          {loading && <p role="status">Checking local AI...</p>}
          <form onSubmit={ask}>
            <fieldset disabled={busy || loading} className="ai-controls">
              <Field label="AI connection">
                <select
                  value={provider}
                  onChange={(event) => changeProvider(event.target.value)}
                >
                  {lifeos?.available && (
                    <option value="lifeos">LifeOS AI (free, no key)</option>
                  )}
                  <option value="local">Local AI (Ollama, no key)</option>
                  <option value="openai">OpenAI API key (cloud)</option>
                  <option value="bedrock">
                    AWS Bedrock access keys (cloud)
                  </option>
                </select>
              </Field>
              {provider === 'local' && (
                <div className="ai-status">
                  <p>{status?.message || 'Local AI status is not loaded.'}</p>
                  <code>ollama pull llama3.2:3b</code>
                  <p>
                    Run Ollama with OLLAMA_NO_CLOUD=1. Keep MongoDB on this
                    computer too.
                  </p>
                  <button
                    type="button"
                    className="space-secondary"
                    onClick={() =>
                      perform(async () => {
                        const result = await apiRequest('/ai/status');
                        if (active.current) {
                          setStatus(result.local);
                          setLoading(false);
                        }
                      })
                    }
                  >
                    Check local AI
                  </button>
                </div>
              )}
              {provider === 'lifeos' && (
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
              )}
              {provider !== 'lifeos' && (
                <Field label="Model ID">
                  <input
                    required
                    maxLength={300}
                    value={models[provider]}
                    list={provider === 'local' ? 'ai-local-models' : undefined}
                    placeholder={
                      provider === 'bedrock'
                        ? 'Your Bedrock model or inference profile ID'
                        : undefined
                    }
                    onChange={(event) =>
                      setModels({ ...models, [provider]: event.target.value })
                    }
                  />
                </Field>
              )}
              <datalist id="ai-local-models">
                {(status?.models ?? []).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              {provider === 'openai' && secretField('OpenAI API key', 'apiKey')}
              {provider === 'bedrock' && (
                <>
                  {secretField('AWS region', 'region', false)}
                  {secretField('AWS access key ID', 'accessKeyId')}
                  {secretField('AWS secret access key', 'secretAccessKey')}
                  {secretField('AWS session token (optional)', 'sessionToken')}
                </>
              )}
              {provider === 'lifeos' && (
                <p className="ai-warning">
                  LifeOS AI sends your question, recent chat, and the selected
                  data excerpts to free AI providers (Groq or Google Gemini) to
                  write the answer.
                </p>
              )}
              {byok && (
                <p className="ai-warning">
                  Cloud mode sends your question, recent chat, and selected data
                  excerpts to {provider === 'openai' ? 'OpenAI' : 'AWS Bedrock'}
                  . Charges may apply. Keys stay in memory only. They clear when
                  you leave this page or change provider. Use HTTPS on a real
                  phone.
                </p>
              )}
              {byok && !safeCloud && (
                <p className="ai-warning" role="alert">
                  Cloud keys are disabled on this HTTP connection. Use local AI,
                  an HTTPS website and backend, or the localhost website on your
                  computer.
                </p>
              )}
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
              {provider !== 'local' && (
                <label className="ai-check">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={byok && !safeCloud}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  I agree to send the selected data and chat to this cloud
                  provider.
                </label>
              )}
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
                disabled={
                  !question.trim() ||
                  !topics.length ||
                  (provider !== 'local' && !consent) ||
                  (byok && !safeCloud)
                }
              >
                <Send size={16} />
                {busy ? 'AI is thinking...' : 'Ask AI'}
              </button>
            </fieldset>
          </form>
          {busy && (
            <p role="status">
              Working... A local answer can take up to two minutes.
            </p>
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
                    : `${{ local: 'Local AI', lifeos: 'LifeOS AI', openai: 'OpenAI', bedrock: 'AWS Bedrock' }[entry.provider] ?? 'AI'} · ${entry.model}`}
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
