import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  BrainCircuit,
  Check,
  Dumbbell,
  Heart,
  NotebookPen,
  Wallet,
} from 'lucide-react';
import { dateKey, dueOn, recentDays } from './utils.js';
import { Stat } from './shared.jsx';
import { apiRequest } from '../api.js';
import CountUp from '../ui/CountUp.jsx';
import Lumi, { pickMood } from '../ui/Lumi.jsx';
import { usePrefs } from '../ui/prefs.js';
import { inr, monthKey } from '../money/format.js';

const tips = {
  happy: 'One small thing done is a good day. Pick the easiest one first.',
  proud: 'Every routine is done today. Take a breath, you earned it.',
  worried:
    'Something needs a look. A two-minute check now saves a worry later.',
  sleepy: 'It is late. Notes can wait until morning.',
  thinking: 'Getting your day ready…',
};

function useMonthMoney(onSessionExpired) {
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/money/overview?month=${monthKey()}`, {
      signal: controller.signal,
    })
      .then(
        (data) => !controller.signal.aborted && setState({ data, error: '' }),
      )
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onSessionExpired?.();
        setState({ data: null, error: failure.message });
      });
    return () => controller.abort();
  }, [onSessionExpired]);
  return state;
}

export default function Today({
  store,
  user,
  aiAvailable = false,
  onSessionExpired,
}) {
  const [prefs] = usePrefs();
  const moneyState = useMonthMoney(onSessionExpired);
  const money = moneyState.data;
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
  const week = recentDays();
  const workouts = store.data.workouts.filter((entry) =>
    week.includes(entry.date),
  );
  const budget = money?.budget ?? null;
  const overBudget = Boolean(budget && money.spentMinor > budget.limitMinor);
  const mood = pickMood({
    hour: new Date().getHours(),
    overBudget,
    overdue: reminders.some((entry) => entry.dueDate < today),
    routinesDone: done,
    routinesTotal: routines.length,
    loading: false,
  });
  const routineShare = routines.length ? done / routines.length : 0;
  const quickActions = [
    {
      title: 'Catch a thought',
      subtitle: 'New note or reminder',
      href: '#notes/new',
      icon: NotebookPen,
      tone: 'notes',
    },
    {
      title: 'Make a little move',
      subtitle: 'Log your workout',
      href: '#workouts/new',
      icon: Dumbbell,
      tone: 'workouts',
    },
    {
      title: 'Keep a small promise',
      subtitle: 'Add a daily routine',
      href: '#routines/new',
      icon: Heart,
      tone: 'routines',
    },
    {
      title: 'Know where it goes',
      subtitle: 'Add a payment',
      href: '#money/new',
      icon: Wallet,
      tone: 'money',
    },
    ...(aiAvailable
      ? [
          {
            title: 'Just say it',
            subtitle: 'Tell LifeOS or ask AI',
            href: '#ai',
            icon: BrainCircuit,
            tone: 'ai',
          },
        ]
      : []),
  ];
  return (
    <>
      <section className="today-hero hero-card" data-space="today">
        <div className="today-hero-text">
          <span className="space-eyebrow">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
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
        {prefs.lumi && (
          <figure className="lumi-card">
            <Lumi mood={mood} size={104} />
            <figcaption>
              <strong>Lumi</strong>
              <span>{tips[mood]}</span>
            </figcaption>
          </figure>
        )}
      </section>
      <div className="space-stats">
        <Stat
          label="Daily usuals"
          value={
            <>
              <CountUp value={done} /> / {routines.length}
            </>
          }
          detail="Done today"
          icon={Heart}
          space="routines"
        >
          {routines.length > 0 && (
            <span
              className="ring-wrap"
              role="img"
              aria-label={`${Math.round(routineShare * 100)}% of today's routines done`}
            >
              <svg className="progress-ring" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" />
                {routineShare > 0 && (
                  <circle
                    cx="22"
                    cy="22"
                    r="18"
                    pathLength="100"
                    strokeDasharray={`${routineShare * 100} 100`}
                  />
                )}
              </svg>
              <span aria-hidden="true">{Math.round(routineShare * 100)}%</span>
            </span>
          )}
        </Stat>
        <Stat
          label="Your movement"
          value={
            <>
              <CountUp value={workouts.length} /> sessions
            </>
          }
          detail="Last 7 days"
          icon={Dumbbell}
          space="workouts"
        >
          <ol className="week-dots" aria-label="Workout days, last 7 days">
            {week.map((date) => {
              const active = workouts.some((entry) => entry.date === date);
              const day = new Date(`${date}T12:00:00`).toLocaleDateString(
                'en-IN',
                { weekday: 'short' },
              );
              return (
                <li
                  key={date}
                  className={active ? 'on' : ''}
                  title={`${day}: ${active ? 'worked out' : 'rest day'}`}
                >
                  <span className="sr-only">
                    {day}: {active ? 'worked out' : 'rest day'}
                  </span>
                </li>
              );
            })}
          </ol>
        </Stat>
        <Stat
          label="This month"
          value={
            money ? <CountUp value={money.spentMinor} format={inr} /> : '—'
          }
          detail={
            moneyState.error
              ? 'Money could not load'
              : budget
                ? `Spent · ${Math.round((money.spentMinor / budget.limitMinor) * 100)}% of ${inr(budget.limitMinor)} budget`
                : 'Spent · no budget set'
          }
          icon={Wallet}
          space="money"
          tone={overBudget ? 'warning' : ''}
          href="#money"
        >
          {budget && (
            <div
              className={`daily-progress ${overBudget ? 'over' : ''}`}
              role="img"
              aria-label={`${Math.round((money.spentMinor / budget.limitMinor) * 100)}% of this month's budget used`}
            >
              <span
                style={{
                  width: `${Math.min(100, (money.spentMinor / budget.limitMinor) * 100)}%`,
                }}
              />
            </div>
          )}
        </Stat>
      </div>
      <div className="section-label">
        <h2>A little space for everything</h2>
        <span>Your spaces, your own pace.</span>
      </div>
      <div className="quick-spaces">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <a
              key={action.href}
              href={action.href}
              className="quick-space"
              data-space={action.tone}
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
        <section className="today-checklist" data-space="routines">
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
        <section className="today-reminders" data-space="notes">
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
