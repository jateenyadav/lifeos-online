import { Repeat } from 'lucide-react';
import { useLoad } from './client.js';
import { dayLabel, inr } from './format.js';
import { EmptyState, ErrorNote, Loading } from './parts.jsx';
import { listOf } from './TxnDrawer.jsx';

const periods = {
  weekly: 'Every week',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  yearly: 'Every year',
};

export default function Subscriptions() {
  const { data, error, loading, reload } = useLoad('/subscriptions');
  const items = listOf(data);
  const monthly = items.reduce((sum, item) => sum + item.monthlyMinor, 0);
  const yearly = items.reduce((sum, item) => sum + item.yearlyMinor, 0);
  return (
    <div className="money-page">
      <ErrorNote message={error} onRetry={reload} />
      {loading && !data && <Loading rows={4} label="Loading subscriptions…" />}
      {data && (
        <>
          <div className="stat-row">
            <section className="card stat-card">
              <span className="label">Each month</span>
              <strong className="mid-number">{inr(monthly)}</strong>
            </section>
            <section className="card stat-card">
              <span className="label">Each year</span>
              <strong className="mid-number">{inr(yearly)}</strong>
            </section>
          </div>
          <section className="card list-card" aria-label="Subscriptions">
            {items.length ? (
              <ul className="txn-list">
                {items.map((item) => (
                  <li key={item.title} className="txn-row static">
                    <span className="txn-icon" aria-hidden="true">
                      <Repeat size={18} />
                    </span>
                    <span className="txn-main">
                      <strong>{item.title}</strong>
                      <small>
                        {periods[item.period] ?? item.period} · next around{' '}
                        {dayLabel(item.nextDate)} · seen {item.count} times
                      </small>
                    </span>
                    <span className="txn-amount">
                      <span className="amount">{inr(item.amountMinor)}</span>
                      <small>{inr(item.yearlyMinor)} a year</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Repeat}
                title="No subscriptions found yet"
                detail="LifeOS spots them after 3 similar payments to the same place."
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
