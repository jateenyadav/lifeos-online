import { useState } from 'react';
import { Archive, Bell, Check, Pin } from 'lucide-react';
import { dateKey, displayDate } from './utils.js';
import {
  deleteEntry,
  Editor,
  Empty,
  Field,
  Filters,
  RecordActions,
  SpaceHeading,
  Stat,
} from './shared.jsx';

const blank = (kind = 'note') => ({
  title: '',
  body: '',
  kind,
  tag: 'Personal',
  dueDate: kind === 'reminder' ? dateKey() : '',
  pinned: false,
  completed: false,
  archived: false,
});

export default function Notes({ store, create = false }) {
  const [editor, setEditor] = useState(create ? blank() : null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [localError, setLocalError] = useState('');
  const today = dateKey();
  const notes = store.data.notes;
  const visible = notes
    .filter((entry) => {
      if (filter === 'Archived' ? !entry.archived : entry.archived)
        return false;
      if (filter === 'Notes' && entry.kind !== 'note') return false;
      if (filter === 'Reminders' && entry.kind !== 'reminder') return false;
      if (filter === 'Pinned' && !entry.pinned) return false;
      return `${entry.title} ${entry.body} ${entry.tag}`
        .toLowerCase()
        .includes(query.toLowerCase());
    })
    .sort(
      (first, second) =>
        Number(second.pinned) - Number(first.pinned) ||
        String(second.updatedAt).localeCompare(String(first.updatedAt)),
    );
  const change = (key, value) =>
    setEditor((previous) => ({ ...previous, [key]: value }));
  function open(entry) {
    setEditor(entry ? { ...entry, dueDate: entry.dueDate || '' } : blank());
    setLocalError('');
  }
  async function submit(event) {
    event.preventDefault();
    const { id, title, body, kind, tag, dueDate, pinned, completed, archived } =
      editor;
    if (!title.trim()) return setLocalError('Give your note a title.');
    if (kind === 'reminder' && !dueDate)
      return setLocalError('Choose a reminder date.');
    if (
      await store.save(
        'notes',
        {
          title,
          body,
          kind,
          tag,
          dueDate: dueDate || null,
          pinned,
          completed,
          archived,
        },
        id,
      )
    )
      setEditor(null);
  }
  return (
    <>
      <SpaceHeading
        eyebrow="YOUR SECOND BRAIN"
        title="Notes & reminders"
        description="Catch an idea. Clear your head. Remember what matters."
        action="New note"
        onAction={() => open()}
      />
      <div className="space-stats">
        <Stat
          label="In your notebook"
          value={
            notes.filter((entry) => !entry.archived && entry.kind === 'note')
              .length
          }
          detail="Ideas safely saved"
        />
        <Stat
          label="Due now"
          value={
            notes.filter(
              (entry) =>
                !entry.archived &&
                entry.kind === 'reminder' &&
                !entry.completed &&
                entry.dueDate <= today,
            ).length
          }
          detail="Today and overdue"
        />
        <Stat
          label="Pinned"
          value={
            notes.filter((entry) => !entry.archived && entry.pinned).length
          }
          detail="Always within reach"
        />
      </div>
      {editor && (
        <Editor
          title={editor.id ? 'Edit note or reminder' : 'New note or reminder'}
          saving={store.saving}
          onCancel={() => setEditor(null)}
          onSubmit={submit}
          error={localError}
        >
          <div className="form-grid">
            <Field label="Title">
              <input
                autoFocus
                required
                maxLength={120}
                value={editor.title}
                onChange={(event) => change('title', event.target.value)}
                placeholder="What is on your mind?"
              />
            </Field>
            <Field label="Type">
              <select
                value={editor.kind}
                onChange={(event) => change('kind', event.target.value)}
              >
                <option value="note">Note</option>
                <option value="reminder">Reminder</option>
              </select>
            </Field>
          </div>
          <Field label="Details">
            <textarea
              rows={5}
              maxLength={10000}
              value={editor.body}
              onChange={(event) => change('body', event.target.value)}
              placeholder="Ideas, a checklist, or a little context…"
            />
          </Field>
          <div className="form-grid">
            <Field label="Tag">
              <input
                maxLength={40}
                value={editor.tag}
                onChange={(event) => change('tag', event.target.value)}
              />
            </Field>
            {editor.kind === 'reminder' && (
              <Field label="Reminder date">
                <input
                  type="date"
                  required
                  value={editor.dueDate}
                  onChange={(event) => change('dueDate', event.target.value)}
                />
              </Field>
            )}
          </div>
          <label className="space-check">
            <input
              type="checkbox"
              checked={editor.pinned}
              onChange={(event) => change('pinned', event.target.checked)}
            />{' '}
            Pin to the top
          </label>
        </Editor>
      )}
      <div className="space-toolbar">
        <Filters
          values={['All', 'Notes', 'Reminders', 'Pinned', 'Archived']}
          active={filter}
          onChange={setFilter}
        />
        <input
          className="space-search"
          type="search"
          aria-label="Search notes"
          placeholder="Search notes, details, tags…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="notes-grid">
        {visible.map((entry) => (
          <article
            key={entry.id}
            className={`note-card ${entry.pinned ? 'pinned' : ''} ${entry.completed ? 'completed' : ''}`}
          >
            <div className="record-meta">
              <span className="record-tag">
                {entry.kind === 'reminder' ? <Bell size={12} /> : null}
                {entry.tag || 'Personal'}
              </span>
              {entry.pinned && <Pin size={15} />}
            </div>
            <h2>{entry.title}</h2>
            <p className="note-body">
              {entry.body || 'A little thought, safely kept.'}
            </p>
            {entry.kind === 'reminder' && (
              <span
                className={`due-label ${!entry.completed && entry.dueDate < today ? 'overdue' : ''}`}
              >
                {entry.completed
                  ? 'Completed'
                  : entry.dueDate < today
                    ? 'Overdue'
                    : entry.dueDate === today
                      ? 'Due today'
                      : 'Due'}{' '}
                · {displayDate(entry.dueDate)}
              </span>
            )}
            <RecordActions
              title={entry.title}
              saving={store.saving}
              onEdit={() => open(entry)}
              onDelete={() => deleteEntry(store, 'notes', entry)}
            >
              {entry.kind === 'reminder' && (
                <button
                  className="space-icon-button"
                  aria-label={`${entry.completed ? 'Reopen' : 'Complete'} ${entry.title}`}
                  title={entry.completed ? 'Reopen' : 'Complete'}
                  disabled={store.saving}
                  onClick={() =>
                    store.save(
                      'notes',
                      { completed: !entry.completed },
                      entry.id,
                    )
                  }
                >
                  <Check size={17} />
                </button>
              )}
              <button
                className="space-icon-button"
                aria-label={`${entry.pinned ? 'Unpin' : 'Pin'} ${entry.title}`}
                title={entry.pinned ? 'Unpin' : 'Pin'}
                disabled={store.saving}
                onClick={() =>
                  store.save('notes', { pinned: !entry.pinned }, entry.id)
                }
              >
                <Pin size={16} />
              </button>
              <button
                className="space-icon-button"
                aria-label={`${entry.archived ? 'Restore' : 'Archive'} ${entry.title}`}
                title={entry.archived ? 'Restore' : 'Archive'}
                disabled={store.saving}
                onClick={() =>
                  store.save('notes', { archived: !entry.archived }, entry.id)
                }
              >
                <Archive size={16} />
              </button>
            </RecordActions>
          </article>
        ))}
      </div>
      {!visible.length && (
        <Empty
          title={
            query || filter !== 'All'
              ? 'Nothing here just yet.'
              : 'A calmer mind starts with one note.'
          }
          detail="Write a thought, make a reminder, or pin something important."
          action="Create your first note"
          onAction={() => open()}
        />
      )}
      <p className="space-footnote">
        Reminders appear here and on Today. Device notifications are not
        enabled.
      </p>
    </>
  );
}
