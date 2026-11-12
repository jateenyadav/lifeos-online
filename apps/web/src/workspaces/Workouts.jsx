import { useState } from 'react';
import {
  Activity,
  CalendarCheck,
  Copy,
  Dumbbell,
  PersonStanding,
  Sparkles,
  Timer,
} from 'lucide-react';
import { dateKey, displayDate, recentDays, workoutTypes } from './utils.js';
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

const typeIcons = {
  Strength: Dumbbell,
  Cardio: Activity,
  Mobility: PersonStanding,
  Other: Sparkles,
};
const blank = () => ({
  title: '',
  date: dateKey(),
  type: 'Strength',
  duration: 30,
  exercises: '',
  effort: 'Moderate',
});
export default function Workouts({ store, create = false }) {
  const [editor, setEditor] = useState(create ? blank() : null);
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const days = recentDays();
  const workouts = store.data.workouts;
  const thisWeek = workouts.filter((entry) => days.includes(entry.date));
  const visible = workouts
    .filter(
      (entry) =>
        (filter === 'All' || entry.type === filter) &&
        `${entry.title} ${entry.exercises}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((first, second) => second.date.localeCompare(first.date));
  const change = (key, value) =>
    setEditor((previous) => ({ ...previous, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    const { id, title, date, type, duration, exercises, effort } = editor;
    if (
      await store.save(
        'workouts',
        { title, date, type, duration: Number(duration), exercises, effort },
        id,
      )
    )
      setEditor(null);
  }
  return (
    <>
      <SpaceHeading
        eyebrow="SHOW UP FOR YOURSELF"
        title="Workout tracker"
        description="A training journal that makes your next session easier."
        action="Log workout"
        onAction={() => setEditor(blank())}
      />
      <div className="space-stats">
        <Stat
          icon={Dumbbell}
          label="Sessions"
          value={thisWeek.length}
          detail="Last 7 days"
        />
        <Stat
          icon={Timer}
          label="Time moving"
          value={`${thisWeek.reduce((total, entry) => total + entry.duration, 0)} min`}
          detail="Last 7 days"
        />
        <Stat
          icon={CalendarCheck}
          label="Active days"
          value={`${new Set(thisWeek.map((entry) => entry.date)).size} / 7`}
          detail="Your pace, not a competition"
        />
      </div>
      <section className="activity-strip">
        <div>
          <h2>Your week in motion</h2>
          <p>A little movement is still movement.</p>
        </div>
        <div className="activity-days">
          {days.map((date) => {
            const count = workouts.filter(
              (entry) => entry.date === date,
            ).length;
            return (
              <div
                key={date}
                className={count ? 'active' : ''}
                title={`${displayDate(date)}: ${count} sessions`}
              >
                <span>
                  {new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', {
                    weekday: 'short',
                  })}
                </span>
                <strong aria-hidden="true">
                  {count ? <Dumbbell size={17} /> : ''}
                </strong>
                <span className="sr-only">
                  {count ? `${count} sessions` : 'rest day'}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      {editor && (
        <Editor
          title={editor.id ? 'Edit workout' : 'Log workout'}
          saving={store.saving}
          onCancel={() => setEditor(null)}
          onSubmit={submit}
        >
          <div className="template-row">
            <span>Quick start</span>
            {[
              ['A walk', 'Cardio', 20],
              ['Strength session', 'Strength', 45],
              ['Mobility session', 'Mobility', 10],
            ].map(([title, type, duration]) => (
              <button
                type="button"
                className="record-tag"
                key={title}
                onClick={() =>
                  setEditor((previous) => ({
                    ...previous,
                    title,
                    type,
                    duration,
                  }))
                }
              >
                {title}
              </button>
            ))}
          </div>
          <Field label="Workout name">
            <input
              autoFocus
              required
              maxLength={120}
              value={editor.title}
              onChange={(event) => change('title', event.target.value)}
              placeholder="Evening strength session"
            />
          </Field>
          <div className="form-grid">
            <Field label="Date">
              <input
                type="date"
                required
                value={editor.date}
                onChange={(event) => change('date', event.target.value)}
              />
            </Field>
            <Field label="Minutes">
              <input
                type="number"
                min={1}
                max={1440}
                required
                value={editor.duration}
                onChange={(event) => change('duration', event.target.value)}
              />
            </Field>
            <Field label="Workout type">
              <select
                value={editor.type}
                onChange={(event) => change('type', event.target.value)}
              >
                {workoutTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </Field>
            <Field label="How it felt">
              <select
                value={editor.effort}
                onChange={(event) => change('effort', event.target.value)}
              >
                {['Easy', 'Moderate', 'Hard'].map((effort) => (
                  <option key={effort}>{effort}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Exercises, sets & notes">
            <textarea
              rows={4}
              maxLength={4000}
              value={editor.exercises}
              onChange={(event) => change('exercises', event.target.value)}
              placeholder="Squats: 3 sets × 10 reps\nWhat went well? What will you try next time?"
            />
          </Field>
        </Editor>
      )}
      <div className="space-toolbar">
        <Filters
          values={['All', ...workoutTypes]}
          active={filter}
          onChange={setFilter}
        />
        <input
          className="space-search"
          type="search"
          aria-label="Search workouts"
          placeholder="Find a session…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="record-list">
        {visible.map((entry) => {
          const TypeIcon = typeIcons[entry.type] ?? Sparkles;
          return (
            <article
              className="workout-record"
              key={entry.id}
              data-type={entry.type}
            >
              <span className="record-symbol" aria-hidden="true">
                <TypeIcon size={22} />
              </span>
              <div className="record-content">
                <div className="record-meta">
                  <span>{displayDate(entry.date)}</span>
                  <span className="record-tag">{entry.type}</span>
                </div>
                <h2>{entry.title}</h2>
                <p className="workout-facts">
                  <span>
                    <Timer size={13} aria-hidden="true" /> {entry.duration} min
                  </span>
                  <span
                    className={`effort effort-${entry.effort.toLowerCase()}`}
                  >
                    {entry.effort}
                  </span>
                </p>
                {entry.exercises && (
                  <p className="record-description">{entry.exercises}</p>
                )}
              </div>
              <RecordActions
                title={entry.title}
                saving={store.saving}
                onEdit={() => setEditor(entry)}
                onDelete={() => deleteEntry(store, 'workouts', entry)}
              >
                <button
                  className="space-icon-button"
                  aria-label={`Repeat ${entry.title}`}
                  title="Use again"
                  onClick={() =>
                    setEditor({ ...entry, id: undefined, date: dateKey() })
                  }
                >
                  <Copy size={16} />
                </button>
              </RecordActions>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <Empty
          title="Your first session is a fresh start."
          detail="Keep the details you need. Repeat a past session with one click."
          action="Log a workout"
          onAction={() => setEditor(blank())}
        />
      )}
    </>
  );
}
