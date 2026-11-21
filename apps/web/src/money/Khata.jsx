import { useState } from 'react';
import { ChevronRight, FileUp, HandCoins, UserPlus } from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import { Sheet } from '../ui/Sheet.jsx';
import CountUp from '../ui/CountUp.jsx';
import { useAction, useLoad } from './client.js';
import { dayLabel, inr } from './format.js';
import { EmptyState, ErrorNote, Field, Loading, TxnRow } from './parts.jsx';
import TxnDrawer, { listOf, unwrap } from './TxnDrawer.jsx';
import { BulkImport } from './KhataImport.jsx';

export function balanceWords(minor) {
  if (minor > 0) return { text: 'owes you', tone: 'in' };
  if (minor < 0) return { text: 'you owe', tone: 'out' };
  return { text: 'settled', tone: 'muted' };
}

function AddPerson({ onClose }) {
  const [name, setName] = useState('');
  const { run, busy, error } = useAction();
  return (
    <Sheet title="Add a person" onClose={onClose} busy={busy}>
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await run('/khata/contacts', {
            method: 'POST',
            body: { name: name.trim() },
          });
          const contact = unwrap(result, 'contact');
          if (contact?.id) window.location.hash = `#money/khata/${contact.id}`;
          if (result) onClose();
        }}
      >
        <Field label="Name">
          <input
            required
            maxLength={80}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            Add person
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export default function Khata() {
  const { data, error, loading, reload } = useLoad('/khata');
  const { data: claims } = useLoad('/reimbursements');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState(null);
  const waitingCount = (claims?.items ?? []).filter(
    (item) => item.waiting,
  ).length;
  const contacts = data?.contacts ?? [];
  const left = listOf(data?.left);
  return (
    <div className="money-page">
      <ErrorNote message={error} onRetry={reload} />
      {loading && !data && <Loading rows={5} label="Loading khata…" />}
      {data && (
        <>
          <div className="stat-row">
            <section className="card stat-card">
              <span className="label">People owe you</span>
              <strong className="mid-number text-in">
                <CountUp value={data.owedToMeMinor} format={inr} />
              </strong>
            </section>
            <section className="card stat-card">
              <span className="label">You owe</span>
              <strong className="mid-number text-out">
                <CountUp value={data.iOweMinor} format={inr} />
              </strong>
            </section>
            <a className="card stat-card stat-link" href="#money/reimburse">
              <span className="label">
                <HandCoins size={15} aria-hidden="true" /> Getting money back (
                {waitingCount})
              </span>
              <strong className="mid-number">
                {inr(claims?.waitingMinor ?? 0)}
              </strong>
              <ChevronRight
                size={18}
                className="stat-arrow"
                aria-hidden="true"
              />
            </a>
          </div>
          <div className="toolbar">
            <h2 className="section-title">People</h2>
            <div className="page-actions">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setImporting(true)}
              >
                <FileUp size={16} aria-hidden="true" /> Import everyone
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setAdding(true)}
              >
                <UserPlus size={16} aria-hidden="true" /> Add person
              </button>
            </div>
          </div>
          <section className="card list-card" aria-label="People in your khata">
            {contacts.length ? (
              <ul className="people-list">
                {contacts.map(({ contact, balance, lastDate, overdue }) => {
                  const words = balanceWords(balance.adjustedMinor);
                  return (
                    <li key={contact.id}>
                      <a
                        href={`#money/khata/${contact.id}`}
                        className="person-row"
                      >
                        <Avatar name={contact.name} size={42} />
                        <span className="txn-main">
                          <strong>{contact.name}</strong>
                          <small>
                            {lastDate
                              ? `Last entry ${dayLabel(lastDate)}`
                              : 'No entries yet'}
                            {overdue && (
                              <span className="badge badge-danger">
                                Overdue
                              </span>
                            )}
                          </small>
                        </span>
                        <span className="txn-amount">
                          <span className={`amount text-${words.tone}`}>
                            {inr(Math.abs(balance.adjustedMinor))}
                          </span>
                          <small>{words.text}</small>
                        </span>
                        <ChevronRight
                          size={18}
                          aria-hidden="true"
                          className="row-chevron"
                        />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                title="No one in your khata yet"
                detail="Add a person, or import your old khata notes in one go."
              >
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setImporting(true)}
                >
                  Import everyone
                </button>
              </EmptyState>
            )}
          </section>
          <section className="card list-card" aria-labelledby="left-title">
            <header className="card-head">
              <h2 id="left-title">Left for later</h2>
              <span className="hint">{left.length} waiting</span>
            </header>
            {left.length ? (
              <ul className="txn-list">
                {left.map((txn) => (
                  <TxnRow key={txn.id} txn={txn} onOpen={setOpen} />
                ))}
              </ul>
            ) : (
              <p className="hint pad">
                Payments you answer with “Just leave it” wait here.
              </p>
            )}
          </section>
        </>
      )}
      {adding && <AddPerson onClose={() => setAdding(false)} />}
      {importing && <BulkImport onClose={() => setImporting(false)} />}
      {open && <TxnDrawer txn={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
