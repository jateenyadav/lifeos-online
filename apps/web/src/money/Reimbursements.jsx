import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import CountUp from '../ui/CountUp.jsx';
import { useLoad } from './client.js';
import { dayLabel, inr } from './format.js';
import { EmptyState, ErrorNote, Loading } from './parts.jsx';
import TxnDrawer from './TxnDrawer.jsx';

function ClaimRow({ item, onOpen }) {
  const { txn, payBackTo, paidBy, waiting } = item;
  return (
    <li>
      <button type="button" className="txn-row" onClick={() => onOpen(txn)}>
        <span className="txn-icon" aria-hidden="true">
          <HandCoins size={18} />
        </span>
        <span className="txn-main">
          <strong>{txn.title}</strong>
          <small>
            {dayLabel(txn.date)}
            {txn.purpose ? ` · ${txn.purpose}` : ''}
            {!waiting && paidBy
              ? ` · Back with ${typeof paidBy === 'string' ? paidBy : `${paidBy.title}${paidBy.date ? ` on ${dayLabel(paidBy.date)}` : ''}`}`
              : ''}
          </small>
          {payBackTo && waiting && (
            <span className="claim-note">
              Paid with {payBackTo}&apos;s card: pay {payBackTo} back in Khata
              when the money comes.
            </span>
          )}
        </span>
        <span className="txn-amount">
          <span className="amount">{inr(txn.reimburseMinor)}</span>
          {txn.reimburseMinor !== txn.amountMinor && (
            <small>of {inr(txn.amountMinor)}</small>
          )}
        </span>
      </button>
    </li>
  );
}

export default function Reimbursements() {
  const { data, error, loading, reload } = useLoad('/reimbursements');
  const [open, setOpen] = useState(null);
  const items = data?.items ?? [];
  const waiting = items.filter((item) => item.waiting);
  const done = items.filter((item) => !item.waiting);
  return (
    <div className="money-page">
      <ErrorNote message={error} onRetry={reload} />
      {loading && !data && <Loading rows={4} label="Loading reimbursements…" />}
      {data && (
        <>
          <section className="card hero-card stat-card">
            <span className="label">Waiting to come back</span>
            <strong className="big-number">
              <CountUp value={data.waitingMinor ?? 0} format={inr} />
            </strong>
            <p className="hint">
              {waiting.length} claim{waiting.length === 1 ? '' : 's'}. Claimed
              money does not count as spending while you wait. To claim, open a
              payment and answer “Will you get this back?”.
            </p>
          </section>
          <section className="card list-card" aria-labelledby="waiting-title">
            <header className="card-head">
              <h2 id="waiting-title">Waiting</h2>
            </header>
            {waiting.length ? (
              <ul className="txn-list">
                {waiting.map((item) => (
                  <ClaimRow key={item.txn.id} item={item} onOpen={setOpen} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={HandCoins}
                title="Nothing waiting"
                detail="Office travel or anything you will get back shows up here."
              />
            )}
          </section>
          {done.length > 0 && (
            <section className="card list-card" aria-labelledby="back-title">
              <header className="card-head">
                <h2 id="back-title">Got back</h2>
              </header>
              <ul className="txn-list">
                {done.map((item) => (
                  <ClaimRow key={item.txn.id} item={item} onOpen={setOpen} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {open && <TxnDrawer txn={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
