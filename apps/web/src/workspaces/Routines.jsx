import { useState } from 'react';
import { Check, Flame, Heart, Pill, Sparkles, Droplets } from 'lucide-react';
import {
  dateKey,
  dayNames,
  dueOn,
  recentDays,
  routineCategories,
  streak,
} from './utils.js';
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

const icons = {
  Medicine: Pill,
  'Skin care': Sparkles,
  Water: Droplets,
  Other: Heart,
};
const blank = () => ({
  title: '',
  category: 'Other',
  time: 'Morning',
  days: [0, 1, 2, 3, 4, 5, 6],
});
export default function Routines({ store, create = false }) {
  const [editor, setEditor] = useState(create ? blank() : null);
  const [date, setDate] = useState(dateKey());
  const [filter, setFilter] = useState('All');
  const [localError, setLocalError] = useState('');
  const routines = store.data.routines;
  const scheduled = routines.filter((entry) => dueOn(entry, date));
  const done = scheduled.filter((entry) =>
    entry.completedDates.includes(date),
  ).length;
  const visible = scheduled.filter(
    (entry) =>
      filter === 'All' ||
      (filter === 'To do'
        ? !entry.completedDates.includes(date)
        : entry.completedDates.includes(date)),
  );
  const change = (key, value) =>
    setEditor((previous) => ({ ...previous, [key]: value }));
  function open(entry) {
    setEditor(entry || blank());
    setLocalError('');
  }
  async function submit(event) {
    event.preventDefault();
    if (!editor.days.length) return setLocalError('Choose at least one day.');
    const { id, title, category, time, days } = editor;
    if (await store.save('routines', { title, category, time, days }, id))
      setEditor(null);
  }
  return (
    <>
      <SpaceHeading
        eyebrow="SMALL HABITS, A STEADIER DAY"
        title="Daily routines"
        description="Keep your usuals close. One gentle check-in at a time."
        action="Add routine"
        onAction={() => open()}
      />
      <div className="space-stats">
        <Stat
          label="Done for the day"
          value={`${done} / ${scheduled.length}`}
          detail="Only your scheduled routines"
        />
        <Stat
          label="Daily progress"
          value={`${scheduled.length ? Math.round((done / scheduled.length) * 100) : 0}%`}
          detail="Small wins add up"
        />
        <Stat
          label="Best current streak"
          value={`${Math.max(0, ...routines.map((entry) => streak(entry)))} days`}
          detail="Counts scheduled days only"
        />
      </div>
      {scheduled.length > 0 && (
        <div
          className="daily-progress"
          role="progressbar"
          aria-label="Daily routine progress"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={scheduled.length}
        >
          <span style={{ width: `${(done / scheduled.length) * 100}%` }} />
        </div>
      )}
      {editor && (
        <Editor
          title={editor.id ? 'Edit routine' : 'Add routine'}
          saving={store.saving}
          onCancel={() => setEditor(null)}
          onSubmit={submit}
          error={localError}
        >
          <Field label="Routine name">
            <input
              autoFocus
              required
              maxLength={120}
              value={editor.title}
              onChange={(event) => change('title', event.target.value)}
              placeholder="Evening skin care"
            />
          </Field>
          <div className="form-grid">
            <Field label="Category">
              <select
                value={editor.category}
                onChange={(event) => change('category', event.target.value)}
              >
                {routineCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>
            <Field label="Time of day">
              <select
                value={editor.time}
                onChange={(event) => change('time', event.target.value)}
              >
                {['Morning', 'Afternoon', 'Evening', 'Anytime'].map((time) => (
                  <option key={time}>{time}</option>
                ))}
              </select>
            </Field>
          </div>
          <fieldset className="days-field">
            <legend>Repeat on</legend>
            {dayNames.map((name, index) => (
              <label className="day-picker" key={name}>
                <input
                  type="checkbox"
                  checked={editor.days.includes(index)}
                  onChange={(event) =>
                    change(
                      'days',
                      event.target.checked
                        ? [...editor.days, index].sort()
                        : editor.days.filter((day) => day !== index),
                    )
                  }
                />
                <span>{name}</span>
              </label>
            ))}
          </fieldset>
        </Editor>
      )}
      <div className="space-toolbar">
        <Filters
          values={['All', 'To do', 'Done']}
          active={filter}
          onChange={setFilter}
        />
        <Field label="Check-in date">
          <input
            type="date"
            max={dateKey()}
            required
            value={date}
            onChange={(event) => {
              if (event.target.value) setDate(event.target.value);
            }}
          />
        </Field>
      </div>
      <div className="record-list">
        {visible.map((entry) => {
          const Icon = icons[entry.category];
          const completed = entry.completedDates.includes(date);
          return (
            <article
              className={`routine-record ${completed ? 'is-done' : ''}`}
              key={entry.id}
            >
              <button
                className="routine-check"
                aria-label={`${completed ? 'Undo' : 'Complete'} ${entry.title}`}
                aria-pressed={completed}
                disabled={store.saving}
                onClick={() => store.check(entry.id, date, !completed)}
              >
                {completed ? <Check size={21} /> : <Icon size={21} />}
              </button>
              <div className="record-content">
                <span className="record-tag">
                  {entry.category} · {entry.time}
                </span>
                <h2>{entry.title}</h2>
                <div className="routine-history" aria-label="Last seven days">
                  {recentDays().map((day) => (
                    <span
                      key={day}
                      title={`${day}: ${entry.completedDates.includes(day) ? 'done' : dueOn(entry, day) ? 'not done' : 'not scheduled'}`}
                      className={
                        entry.completedDates.includes(day)
                          ? 'done'
                          : !dueOn(entry, day)
                            ? 'not-scheduled'
                            : ''
                      }
                    >
                      {dayNames[new Date(`${day}T12:00:00`).getDay()].slice(
                        0,
                        1,
                      )}
                    </span>
                  ))}
                  <small>
                    <Flame size={13} /> {streak(entry)} day streak
                  </small>
                </div>
              </div>
              <RecordActions
                title={entry.title}
                saving={store.saving}
                onEdit={() => open(entry)}
                onDelete={() => deleteEntry(store, 'routines', entry)}
              />
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <Empty
          title={
            done && done === scheduled.length
              ? 'Your daily usuals are done. Nicely done.'
              : 'Make a little room for your routines.'
          }
          detail="Choose your days and time. Check things off here or on Today."
          action="Add a routine"
          onAction={() => open()}
        />
      )}
      {routines.some((entry) => !dueOn(entry, date)) && (
        <section className="unscheduled-list">
          <h2>Not scheduled for this day</h2>
          {routines
            .filter((entry) => !dueOn(entry, date))
            .map((entry) => (
              <article key={entry.id}>
                <div>
                  <strong>{entry.title}</strong>
                  <p>
                    {entry.days.map((day) => dayNames[day]).join(', ')} ·{' '}
                    {entry.time}
                  </p>
                </div>
                <RecordActions
                  title={entry.title}
                  saving={store.saving}
                  onEdit={() => open(entry)}
                  onDelete={() => deleteEntry(store, 'routines', entry)}
                />
              </article>
            ))}
        </section>
      )}
      <p className="space-footnote">
        Medicine tracking records your existing routine. It does not recommend
        medicines or doses.
      </p>
    </>
  );
}
