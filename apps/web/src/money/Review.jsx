import { useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  ListChecks,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useAction, useLoad } from './client.js';
import { dayLabel } from './format.js';
import { Amount, EmptyState, ErrorNote, Loading } from './parts.jsx';
import TxnDrawer, { listOf } from './TxnDrawer.jsx';

export default function Review() {
  const { data, error, loading, reload } = useLoad('/txns?review=1&limit=100');
  const { data: suggestionData } = useLoad('/transfers/suggestions');
  const { data: accountData } = useLoad('/accounts');
  const [open, setOpen] = useState(null);
  const [dismissed, setDismissed] = useState([]);
  const { run, busy, error: actionError } = useAction();
  const items = listOf(data);
  const accounts = listOf(accountData);
  const pairs = listOf(suggestionData).filter(
    (pair) => !dismissed.includes(`${pair.a.id}-${pair.b.id}`),
  );
  const accountName = (id) =>
    accounts.find((account) => account.id === id)?.name ?? 'No account';
  return (
    <div className="money-page">
      <ErrorNote
        message={error || actionError}
        onRetry={error ? reload : undefined}
      />
      {loading && !data && (
        <Loading rows={4} label="Loading the review list…" />
      )}
      {data && (
        <section className="card list-card" aria-labelledby="review-title">
          <header className="card-head">
            <h2 id="review-title">Check these payments</h2>
            <span className="hint">{items.length} waiting</span>
          </header>
          {items.length ? (
            <ul className="review-list">
              {items.map((txn) => (
                <li key={txn.id}>
                  <div className="txn-main">
                    <strong>
                      {txn.title || txn.counterparty || 'Payment'}
                    </strong>
                    <small>
                      {dayLabel(txn.date)} · {txn.category} ·{' '}
                      {accountName(txn.accountId)}
                    </small>
                  </div>
                  <Amount minor={txn.amountMinor} direction={txn.direction} />
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      aria-label={`Confirm ${txn.title}`}
                      onClick={() =>
                        run(`/txns/${txn.id}`, {
                          method: 'PATCH',
                          body: { needsReview: false },
                        })
                      }
                    >
                      <Check size={15} aria-hidden="true" /> Confirm
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${txn.title}`}
                      onClick={() => setOpen(txn)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label={`Delete ${txn.title}`}
                      disabled={busy}
                      onClick={() =>
                        window.confirm(`Delete “${txn.title}”?`) &&
                        run(`/txns/${txn.id}`, { method: 'DELETE' })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ListChecks}
              title="All checked"
              detail="Payments LifeOS is unsure about wait here."
            />
          )}
        </section>
      )}
      {pairs.length > 0 && (
        <section className="card list-card" aria-labelledby="transfer-title">
          <header className="card-head">
            <h2 id="transfer-title">Moves between your accounts?</h2>
          </header>
          <ul className="review-list">
            {pairs.map(({ a, b }) => (
              <li key={`${a.id}-${b.id}`}>
                <ArrowLeftRight size={18} aria-hidden="true" />
                <div className="txn-main">
                  <strong>
                    {accountName(a.accountId)} → {accountName(b.accountId)}
                  </strong>
                  <small>
                    {dayLabel(a.date)} · {a.title} / {b.title}
                  </small>
                </div>
                <Amount minor={a.amountMinor} direction="debit" />
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() =>
                      setDismissed([...dismissed, `${a.id}-${b.id}`])
                    }
                  >
                    Not a transfer
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() =>
                      run(`/txns/${a.id}/transfer`, {
                        method: 'POST',
                        body: { otherId: b.id },
                      })
                    }
                  >
                    Link them
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {open && (
        <TxnDrawer
          txn={open}
          accounts={accounts}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
