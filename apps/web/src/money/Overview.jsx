import { useState } from 'react';
import {
  CalendarClock,
  CreditCard,
  HandCoins,
  ListChecks,
  Repeat,
  RotateCcw,
  Users,
} from 'lucide-react';
import CountUp from '../ui/CountUp.jsx';
import { dateKey } from '../workspaces/utils.js';
import { useAction, useLoad } from './client.js';
import { BarChart, Donut, LineChart, Meter, Ring } from './charts.jsx';
import {
  chartPalette,
  dayLabel,
  inr,
  monthKey,
  monthLabel,
  parseRupees,
  shortMonth,
  toInput,
} from './format.js';
import {
  AmountInput,
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  MonthPicker,
} from './parts.jsx';

export function donutSlices(byCategory, keep = 6) {
  const sorted = [...byCategory].sort((a, b) => b.minor - a.minor);
  const head = sorted
    .slice(0, keep)
    .map((row, index) => ({
      label: row.category,
      value: row.minor,
      color: chartPalette[index],
    }));
  const rest = sorted.slice(keep).reduce((sum, row) => sum + row.minor, 0);
  return rest > 0
    ? [
        ...head,
        { label: 'Everything else', value: rest, color: 'var(--chart-9)' },
      ]
    : head;
}

const comingIcons = {
  card_bill: CreditCard,
  subscription: Repeat,
  khata_due: Users,
};

function BudgetBox({ month, budget, spent }) {
  const [draft, setDraft] = useState(null);
  const { run, busy, error, setError } = useAction();
  async function save(event) {
    event.preventDefault();
    const limitMinor = parseRupees(draft);
    if (!limitMinor) return setError('Enter a budget like 25,000.');
    if (
      await run('/budgets', {
        method: 'PUT',
        body: { month, category: '*', limitMinor },
      })
    )
      setDraft(null);
  }
  if (draft !== null)
    return (
      <form className="budget-form" onSubmit={save}>
        <AmountInput
          id="budget-amount"
          label={`Budget for ${monthLabel(month, 'short')}`}
          value={draft}
          onChange={setDraft}
          autoFocus
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => setDraft(null)}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? 'Saving…' : 'Save budget'}
          </button>
        </div>
      </form>
    );
  if (!budget)
    return (
      <div className="budget-empty">
        <Ring value={0} max={1} size={112} label="No budget set">
          <small>No budget</small>
        </Ring>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => setDraft('')}
        >
          Set a monthly budget
        </button>
      </div>
    );
  const left = budget.limitMinor - spent;
  const pct = Math.round((spent / budget.limitMinor) * 100);
  return (
    <div className="budget-box">
      <Ring
        value={spent}
        max={budget.limitMinor}
        size={124}
        label={`${pct}% of the ${inr(budget.limitMinor)} budget used`}
      >
        <strong>{pct}%</strong>
        <small>of budget</small>
      </Ring>
      <div>
        <p className={left < 0 ? 'text-danger' : 'text-muted'}>
          {left < 0 ? `${inr(-left)} over budget` : `${inr(left)} left`}
        </p>
        <button
          type="button"
          className="link-button"
          onClick={() => setDraft(toInput(budget.limitMinor))}
        >
          Edit budget · {inr(budget.limitMinor)}
        </button>
      </div>
    </div>
  );
}

export default function Overview() {
  const [month, setMonth] = useState(monthKey());
  const { data, error, loading, reload } = useLoad(`/overview?month=${month}`);
  const today = dateKey();
  return (
    <div className="money-page">
      <div className="toolbar">
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <ErrorNote message={error} onRetry={reload} />
      {loading && !data && <Loading rows={4} label="Loading your month…" />}
      {data && (
        <>
          <section
            className="card hero-card money-hero"
            aria-label={`Summary for ${monthLabel(data.month)}`}
          >
            <div className="hero-numbers">
              <div className="hero-main">
                <span className="label">
                  Spent in {monthLabel(data.month, 'long')}
                </span>
                <strong className="big-number" data-testid="spent">
                  <CountUp value={data.spentMinor} format={inr} />
                </strong>
              </div>
              <div className="hero-pair">
                <div>
                  <span className="label">Income</span>
                  <strong className="mid-number text-in">
                    <CountUp value={data.incomeMinor} format={inr} />
                  </strong>
                </div>
                <div>
                  <span className="label">Net</span>
                  <strong
                    className={`mid-number ${data.netMinor < 0 ? 'text-out' : ''}`}
                  >
                    <CountUp
                      value={data.netMinor}
                      format={(v) => inr(v, { sign: true })}
                    />
                  </strong>
                </div>
              </div>
              <div className="pill-row">
                {data.reviewCount > 0 && (
                  <a className="pill pill-warn" href="#money/review">
                    <ListChecks size={14} aria-hidden="true" />{' '}
                    {data.reviewCount} to review
                  </a>
                )}
                {data.leftCount > 0 && (
                  <a className="pill" href="#money/khata">
                    <RotateCcw size={14} aria-hidden="true" /> {data.leftCount}{' '}
                    left for later
                  </a>
                )}
                {data.reimburse?.waitingCount > 0 && (
                  <a className="pill pill-teal" href="#money/reimburse">
                    <HandCoins size={14} aria-hidden="true" />{' '}
                    {inr(data.reimburse.waitingMinor)} to get back
                  </a>
                )}
              </div>
            </div>
            <BudgetBox
              month={data.month}
              budget={data.budget}
              spent={data.spentMinor}
            />
          </section>

          <div className="money-grid">
            <Card title="Spend per day" className="span-2">
              {data.spentMinor > 0 ? (
                <BarChart
                  label={`Spend per day in ${monthLabel(data.month)}`}
                  highlight={today}
                  data={data.daily.map((d) => ({
                    key: d.date,
                    label: dayLabel(d.date),
                    value: d.minor,
                  }))}
                />
              ) : (
                <EmptyState
                  title="No spending this month"
                  detail="Payments you add will show up here day by day."
                />
              )}
            </Card>
            <Card title="Where it went">
              {data.byCategory.length ? (
                <Donut
                  label="Spending by category"
                  slices={donutSlices(data.byCategory)}
                  centerLabel="Spent"
                />
              ) : (
                <EmptyState title="Nothing to split yet" />
              )}
            </Card>
            <Card title="Last 12 months" className="span-2">
              <LineChart
                label="Spent and income over the last 12 months"
                labels={data.trend.map((t) => shortMonth(t.month))}
                series={[
                  {
                    name: 'Spent',
                    color: 'var(--chart-3)',
                    values: data.trend.map((t) => t.spentMinor),
                  },
                  {
                    name: 'Income',
                    color: 'var(--chart-1)',
                    values: data.trend.map((t) => t.incomeMinor),
                    dashed: true,
                  },
                ]}
                area={false}
              />
            </Card>
            <Card title="Top places">
              {data.topMerchants.length ? (
                <ol className="rank-list">
                  {data.topMerchants.map((row) => (
                    <li key={row.title}>
                      <div>
                        <strong>{row.title}</strong>
                        <small>
                          {row.count} payment{row.count === 1 ? '' : 's'}
                        </small>
                      </div>
                      <b>{inr(row.minor)}</b>
                      <Meter
                        value={row.minor}
                        max={data.topMerchants[0].minor}
                        tone="info"
                        label={`${row.title} share`}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState title="No places yet" />
              )}
            </Card>
            <Card title="Coming up">
              {data.comingUp.length ? (
                <ul className="coming-list">
                  {data.comingUp.slice(0, 6).map((row, index) => {
                    const Icon = comingIcons[row.kind] ?? CalendarClock;
                    return (
                      <li key={`${row.kind}-${index}`} data-kind={row.kind}>
                        <span className="coming-icon" aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        <div>
                          <strong>{row.title}</strong>
                          <small>
                            {row.date < today ? 'Was due ' : ''}
                            {dayLabel(row.date)}
                          </small>
                        </div>
                        <b>{inr(row.amountMinor)}</b>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon={CalendarClock}
                  title="Nothing due soon"
                  detail="Card bills, subscriptions and khata dues appear here."
                />
              )}
            </Card>
            <Card title="People and worth">
              <dl className="mini-stats">
                <div>
                  <dt>People owe you</dt>
                  <dd className="text-in">{inr(data.khata.owedToMeMinor)}</dd>
                </div>
                <div>
                  <dt>You owe</dt>
                  <dd className="text-out">{inr(data.khata.iOweMinor)}</dd>
                </div>
                <div>
                  <dt>Net worth</dt>
                  <dd>{inr(data.netWorthMinor)}</dd>
                </div>
              </dl>
              <a className="link-button" href="#money/khata">
                Open Khata
              </a>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
