import {
  ArrowUpRight,
  Bell,
  Check,
  Dumbbell,
  Heart,
  NotebookPen,
  Wallet,
} from 'lucide-react';
import { dateKey, dueOn, money, recentDays } from './utils.js';
import { Stat } from './shared.jsx';

export default function Today({ store, user }) {
  const today = dateKey();
  const routines = store.data.routines.filter((entry) => dueOn(entry, today));
  const done = routines.filter((entry) =>
    entry.completedDates.includes(today),
  ).length;
  const reminders = store.data.notes
    .filter(
      (entry) =>
        entry.kind === 'reminder' &&
        !entry.archived &&
        !entry.completed &&
        entry.dueDate <= today,
    )
    .sort((first, second) => first.dueDate.localeCompare(second.dueDate));
  const workouts = store.data.workouts.filter((entry) =>
    recentDays().includes(entry.date),
  );
  const monthSpend = store.data.expenses
    .filter((entry) => entry.date.startsWith(today.slice(0, 7)))
    .reduce((sum, entry) => sum + entry.amountMinor, 0);
  const quickActions = [
    {
      title: 'Catch a thought',
      subtitle: 'New note or reminder',
      href: '#notes/new',
      icon: NotebookPen,
      tone: 'sage',
    },
    {
      title: 'Make a little move',
      subtitle: 'Log your workout',
      href: '#workouts/new',
      icon: Dumbbell,
      tone: 'peach',
    },
    {
      title: 'Keep a small promise',
      subtitle: 'Add a daily routine',
      href: '#routines/new',
      icon: Heart,
      tone: 'lavender',
    },
    {
      title: 'Know where it goes',
      subtitle: 'Add an expense',
      href: '#spending/new',
      icon: Wallet,
      tone: 'sand',
    },
  ];
  return (
    <>
      <div className="today-hero">
        <div>
          <span className="space-eyebrow">YOUR DAY, A LITTLE LIGHTER</span>
          <h1>
            Hello, {user.name.split(' ')[0]}
            <span>.</span>
          </h1>
          <p>No need to do it all. Start with one small thing.</p>
          <div className="hero-pill">
            <span className="status-dot" />
            {routines.length && done === routines.length
              ? 'Your daily routines are complete. Take a breath.'
              : `${routines.length - done} routines left · ${reminders.length} reminders need a look`}
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span>☀</span>
          <div>
            ONE DAY
            <br />
            <strong>at a time.</strong>
          </div>
        </div>
      </div>
      <div className="space-stats">
        <Stat
          label="Daily usuals"
          value={`${done} / ${routines.length}`}
          detail="Done today"
        />
        <Stat
          label="Your movement"
          value={`${workouts.length} sessions`}
          detail="Last 7 days"
        />
        <Stat
          label="This month"
          value={money(monthSpend)}
          detail="Spending · INR"
        />
      </div>
      <div className="section-label">
        <h2>A little space for everything</h2>
        <span>Four spaces. Your own pace.</span>
      </div>
      <div className="quick-spaces">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <a
              key={action.href}
              href={action.href}
              className={`quick-space ${action.tone}`}
            >
              <span className="quick-icon">
                <Icon size={23} />
              </span>
              <ArrowUpRight className="quick-arrow" size={18} />
              <h3>{action.title}</h3>
              <p>{action.subtitle}</p>
            </a>
          );
        })}
      </div>
      <div className="today-columns">
        <section className="today-checklist">
          <div className="section-label">
            <h2>Your daily usuals</h2>
            <a href="#routines">
              Open space <ArrowUpRight size={14} />
            </a>
          </div>
          {routines.length ? (
            routines.map((entry) => {
              const completed = entry.completedDates.includes(today);
              return (
                <button
                  key={entry.id}
                  className={`today-routine ${completed ? 'is-done' : ''}`}
                  aria-pressed={completed}
                  disabled={store.saving}
                  onClick={() => store.check(entry.id, today, !completed)}
                >
                  <span className="tiny-checkbox">
                    {completed && <Check size={13} />}
                  </span>
                  <span>
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.time} · {entry.category}
                    </small>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="mini-empty">
              <Heart size={24} />
              <h3>A routine you can return to.</h3>
              <p>Add medicine, skin care, or any everyday habit.</p>
              <a href="#routines/new">
                Add your first routine <ArrowUpRight size={14} />
              </a>
            </div>
          )}
        </section>
        <section className="today-reminders">
          <div className="section-label">
            <h2>On your mind</h2>
            <a href="#notes">
              Open notebook <ArrowUpRight size={14} />
            </a>
          </div>
          {reminders.length ? (
            reminders.slice(0, 5).map((entry) => (
              <div className="today-reminder" key={entry.id}>
                <Bell size={17} />
                <div>
                  <strong>{entry.title}</strong>
                  <small>
                    {entry.dueDate < today ? 'Overdue' : 'Due today'} ·{' '}
                    {entry.tag}
                  </small>
                </div>
                <button
                  className="space-icon-button"
                  aria-label={`Complete ${entry.title}`}
                  disabled={store.saving}
                  onClick={() =>
                    store.save('notes', { completed: true }, entry.id)
                  }
                >
                  <Check size={17} />
                </button>
              </div>
            ))
          ) : (
            <div className="mini-empty">
              <NotebookPen size={24} />
              <h3>A little less to carry.</h3>
              <p>No reminders are due. Capture an idea while it is fresh.</p>
              <a href="#notes/new">
                Write something down <ArrowUpRight size={14} />
              </a>
            </div>
          )}
          {reminders.length > 5 && (
            <a className="more-reminders" href="#notes">
              See all {reminders.length} reminders
            </a>
          )}
        </section>
      </div>
      <p className="gentle-footer">
        You do not need a perfect day to make a little progress.
      </p>
    </>
  );
}
