import { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  ClipboardPaste,
  Repeat2,
  Scale,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import { Sheet, Switch } from '../ui/Sheet.jsx';
import { dateKey } from '../workspaces/utils.js';
import { useAction, useLoad } from './client.js';
import {
  dayLabel,
  expenseCategories,
  inr,
  parseRupees,
  toInput,
} from './format.js';
import {
  AmountInput,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
} from './parts.jsx';
import { PhotoUploader, photoUrl } from './TxnDrawer.jsx';
import { PersonImport } from './KhataImport.jsx';
import { balanceWords } from './Khata.jsx';

export function EntrySheet({
  contact,
  entry,
  direction: startDirection = 'gave',
  onClose,
}) {
  const editing = Boolean(entry);
  const [direction] = useState(entry?.direction ?? startDirection);
  const [form, setForm] = useState({
    amount: entry ? toInput(entry.amountMinor) : '',
    date: entry?.date ?? dateKey(),
    note: entry?.note ?? '',
    dueDate: entry?.dueDate ?? '',
    paidForMe: entry?.paidForMe ?? false,
    category: 'Other',
  });
  const { run, busy, error, setError } = useAction();
  const set = (key, value) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const name = contact.name.split(' ')[0];
  async function submit(event) {
    event.preventDefault();
    const amountMinor = parseRupees(form.amount);
    if (!amountMinor) return setError('Enter an amount like 1,500.');
    const body = {
      amountMinor,
      date: form.date,
      note: form.note.trim(),
      dueDate: form.dueDate || null,
    };
    const result = editing
      ? await run(`/khata/entries/${entry.id}`, { method: 'PATCH', body })
      : await run(`/khata/contacts/${contact.id}/entries`, {
          method: 'POST',
          body: {
            direction,
            ...body,
            ...(direction === 'got'
              ? {
                  paidForMe: form.paidForMe,
                  ...(form.paidForMe ? { category: form.category } : {}),
                }
              : {}),
          },
        });
    if (result) onClose();
  }
  const title = editing
    ? 'Edit entry'
    : direction === 'gave'
      ? `You gave ${name}`
      : `You got from ${name}`;
  return (
    <Sheet title={title} onClose={onClose} busy={busy}>
      <form className="form" onSubmit={submit}>
        <p className={`entry-kind kind-${direction}`}>
          {direction === 'gave' ? (
            <ArrowUpRight size={16} aria-hidden="true" />
          ) : (
            <ArrowDownLeft size={16} aria-hidden="true" />
          )}
          {direction === 'gave'
            ? `${name} will owe you more`
            : `${name} will owe you less (or you owe them)`}
        </p>
        <div className="form-grid">
          <AmountInput
            id="entry-amount"
            value={form.amount}
            onChange={(value) => set('amount', value)}
            autoFocus
          />
          <Field label="Date">
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) => set('date', event.target.value)}
            />
          </Field>
        </div>
        <Field label="Note">
          <input
            maxLength={200}
            value={form.note}
            placeholder={
              direction === 'gave'
                ? 'Dinner, cab, loan…'
                : 'Sent back, paid my ticket…'
            }
            onChange={(event) => set('note', event.target.value)}
          />
        </Field>
        {direction === 'gave' && (
          <Field label="Due date (optional)">
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) => set('dueDate', event.target.value)}
            />
          </Field>
        )}
        {direction === 'got' && !editing && (
          <div className="switch-card">
            <Switch
              checked={form.paidForMe}
              onChange={(value) => set('paidForMe', value)}
              label={`${name} paid for something of mine`}
              hint={
                form.paidForMe
                  ? 'Counts as your spending. It shows in your charts and can be claimed back.'
                  : `${name} gave or sent you money. Not your spending.`
              }
            />
            {form.paidForMe && (
              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(event) => set('category', event.target.value)}
                >
                  {expenseCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {editing && (
            <button
              type="button"
              className="btn btn-danger-quiet"
              disabled={busy}
              onClick={async () => {
                if (
                  window.confirm('Delete this entry?') &&
                  (await run(`/khata/entries/${entry.id}`, {
                    method: 'DELETE',
                  }))
                )
                  onClose();
              }}
            >
              <Trash2 size={15} aria-hidden="true" /> Delete
            </button>
          )}
          <button
            type="button"
            className="btn btn-quiet"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

const adjustmentTypes = {
  on_me: 'I’ll bear it',
  waived: 'Waived',
  disputed: 'Disputed',
  pending_confirmation: 'Waiting for them to confirm',
  shared_expense: 'Shared expense',
  discount: 'Discount',
  custom: 'Something else',
};
const reducing = [
  'on_me',
  'waived',
  'disputed',
  'pending_confirmation',
  'shared_expense',
];

function AdjustSheet({ contact, onClose }) {
  const [type, setType] = useState('on_me');
  const [amount, setAmount] = useState('');
  const [reduce, setReduce] = useState(true);
  const [note, setNote] = useState('');
  const { run, busy, error, setError } = useAction();
  return (
    <Sheet
      title={`Adjust ${contact.name.split(' ')[0]}'s balance`}
      onClose={onClose}
      busy={busy}
    >
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();
          const amountMinor = parseRupees(amount);
          if (!amountMinor) return setError('Enter an amount.');
          if (
            await run(`/khata/contacts/${contact.id}/adjustments`, {
              method: 'POST',
              body: { type, amountMinor, reduce, note },
            })
          )
            onClose();
        }}
      >
        <p className="hint">
          Adjustments never change the entries. You can switch them off later.
        </p>
        <Field label="Why">
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setReduce(reducing.includes(event.target.value));
            }}
          >
            {Object.entries(adjustmentTypes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <AmountInput id="adjust-amount" value={amount} onChange={setAmount} />
        <Switch
          checked={reduce}
          onChange={setReduce}
          label="Bring the balance toward zero"
        />
        <Field label="Note">
          <input
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
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
          <button className="btn btn-primary" disabled={busy}>
            Save adjustment
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function Lightbox({ photos, index, onIndex, onClose, onRemove, busy }) {
  const [zoom, setZoom] = useState(1);
  const photo = photos[index];
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && index < photos.length - 1)
        onIndex(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndex]);
  if (!photo) return null;
  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Old khata photo"
    >
      <div className="lightbox-bar">
        <span>
          {index + 1} / {photos.length}
        </span>
        <div className="row-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
          >
            <ZoomOut size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom in"
            disabled={zoom >= 3}
            onClick={() => setZoom(Math.min(3, zoom + 0.5))}
          >
            <ZoomIn size={18} />
          </button>
          <button
            type="button"
            className="icon-button danger"
            aria-label="Remove photo"
            disabled={busy}
            onClick={() => onRemove(photo)}
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Close photo"
            autoFocus
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div
        className="lightbox-stage"
        onDoubleClick={() => setZoom(zoom > 1 ? 1 : 2)}
      >
        <img
          src={photoUrl(photo.id)}
          alt={photo.caption || 'Old khata photo'}
          style={{ transform: `scale(${zoom})` }}
        />
      </div>
    </div>
  );
}

function EntryRow({ entry, onOpen }) {
  const running = balanceWords(entry.runningMinor ?? 0);
  return (
    <li>
      <button type="button" className="entry-row" onClick={() => onOpen(entry)}>
        <span
          className={`entry-icon kind-${entry.direction}`}
          aria-hidden="true"
        >
          {entry.direction === 'gave' ? (
            <ArrowUpRight size={16} />
          ) : (
            <ArrowDownLeft size={16} />
          )}
        </span>
        <span className="txn-main">
          <strong>
            {entry.note ||
              (entry.direction === 'gave' ? 'You gave' : 'You got')}
          </strong>
          <small>
            {dayLabel(entry.date)}
            {entry.paidForMe && (
              <span className="badge badge-info">Paid for me</span>
            )}
            {entry.linkedTxnId && !entry.paidForMe && (
              <span className="badge badge-quiet">From a payment</span>
            )}
            {entry.dueDate && (
              <span className="badge badge-warn">
                Due {dayLabel(entry.dueDate)}
              </span>
            )}
          </small>
        </span>
        <span className="txn-amount">
          <span
            className={`amount ${entry.direction === 'gave' ? 'is-out' : 'is-in'}`}
          >
            <span className="sr-only">
              {entry.direction === 'gave' ? 'You gave ' : 'You got '}
            </span>
            {inr(entry.amountMinor)}
          </span>
          <small className="running">
            Balance {inr(Math.abs(entry.runningMinor ?? 0))}{' '}
            {running.tone === 'muted'
              ? ''
              : running.tone === 'in'
                ? 'due to you'
                : 'you owe'}
          </small>
        </span>
      </button>
    </li>
  );
}

export default function KhataContact({ id }) {
  const { data, error, loading, reload } = useLoad(`/khata/contacts/${id}`);
  const [sheet, setSheet] = useState(null); // {kind, ...}
  const [viewer, setViewer] = useState(null);
  const { run, busy, error: actionError } = useAction();
  if (loading && !data)
    return <Loading rows={6} label="Loading this person…" />;
  if (error && !data)
    return (
      <div className="money-page">
        <a className="back-link" href="#money/khata">
          <ArrowLeft size={16} aria-hidden="true" /> All people
        </a>
        <ErrorNote message={error} onRetry={reload} />
      </div>
    );
  if (!data) return null;
  const {
    contact,
    balance,
    entries = [],
    adjustments = [],
    photos = [],
  } = data;
  const name = contact.name.split(' ')[0];
  const appEntries = entries.filter((entry) => !entry.isOpening);
  const opening = entries.filter((entry) => entry.isOpening);
  const words = balanceWords(balance.adjustedMinor);
  const open = (entry) => setSheet({ kind: 'entry', entry });
  return (
    <div className="money-page khata-contact">
      <a className="back-link" href="#money/khata">
        <ArrowLeft size={16} aria-hidden="true" /> All people
      </a>
      <section
        className={`card hero-card balance-card tone-${words.tone}`}
        aria-label={`${contact.name} balance`}
      >
        <div className="balance-who">
          <Avatar name={contact.name} size={56} />
          <div>
            <h1>{contact.name}</h1>
            <p className="hint">
              Gave {inr(balance.givenMinor)} · Got {inr(balance.receivedMinor)}
            </p>
          </div>
        </div>
        <div className="balance-figure">
          <span className="label">
            {words.tone === 'in'
              ? `${name} owes you`
              : words.tone === 'out'
                ? `You owe ${name}`
                : 'All settled'}
          </span>
          <strong className={`big-number text-${words.tone}`}>
            {inr(Math.abs(balance.adjustedMinor))}
          </strong>
          {balance.adjustedMinor !== balance.actualMinor && (
            <small className="hint">
              Before adjustments {inr(balance.actualMinor, { sign: true })}
            </small>
          )}
        </div>
        <div className="balance-actions">
          <button
            type="button"
            className="btn btn-gave"
            onClick={() => setSheet({ kind: 'entry', direction: 'gave' })}
          >
            <ArrowUpRight size={17} aria-hidden="true" /> You gave
          </button>
          <button
            type="button"
            className="btn btn-got"
            onClick={() => setSheet({ kind: 'entry', direction: 'got' })}
          >
            <ArrowDownLeft size={17} aria-hidden="true" /> You got
          </button>
        </div>
      </section>
      <div className="row-actions wrap">
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => setSheet({ kind: 'adjust' })}
        >
          <Scale size={15} aria-hidden="true" /> Adjust
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                `Swap who owes whom for ${contact.name}? Every “gave” becomes “got” and back.`,
              )
            )
              run(`/khata/contacts/${contact.id}/swap`, { method: 'POST' });
          }}
        >
          <Repeat2 size={15} aria-hidden="true" /> Swap who owes whom
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => setSheet({ kind: 'import' })}
        >
          <ClipboardPaste size={15} aria-hidden="true" /> Add old khata
        </button>
        <button
          type="button"
          className="btn btn-danger-quiet btn-sm"
          disabled={busy}
          onClick={async () => {
            if (
              window.confirm(
                `Delete ${contact.name} and every entry, adjustment and photo?`,
              ) &&
              (await run(`/khata/contacts/${contact.id}`, { method: 'DELETE' }))
            )
              window.location.hash = '#money/khata';
          }}
        >
          <Trash2 size={15} aria-hidden="true" /> Delete person
        </button>
      </div>
      <ErrorNote message={actionError} />

      <section className="card list-card" aria-labelledby="entries-title">
        <header className="card-head">
          <h2 id="entries-title">Entries</h2>
          <span className="hint">{entries.length} total</span>
        </header>
        {!entries.length && (
          <EmptyState
            title={`Nothing with ${name} yet`}
            detail="Use You gave or You got to start."
          />
        )}
        {appEntries.length > 0 && (
          <ul className="entry-list" aria-label="Entries recorded in the app">
            {appEntries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onOpen={open} />
            ))}
          </ul>
        )}
        {opening.length > 0 && (
          <>
            <h3 className="opening-head">
              Old khata · opening balance (before the app)
            </h3>
            <ul
              className="entry-list opening"
              aria-label="Opening balance entries"
            >
              {opening.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onOpen={open} />
              ))}
            </ul>
          </>
        )}
      </section>

      {adjustments.length > 0 && (
        <section className="card list-card" aria-labelledby="adjust-title">
          <header className="card-head">
            <h2 id="adjust-title">Adjustments</h2>
          </header>
          <ul className="adjust-list">
            {adjustments.map((adjustment) => (
              <li key={adjustment.id} data-active={adjustment.active}>
                <span className="txn-main">
                  <strong>
                    {adjustmentTypes[adjustment.type] ?? adjustment.type}
                  </strong>
                  <small>
                    {adjustment.note ||
                      (adjustment.active ? 'Counting' : 'Switched off')}
                  </small>
                </span>
                <b>{inr(adjustment.deltaMinor, { sign: true })}</b>
                <Switch
                  checked={adjustment.active}
                  label={<span className="sr-only">Count this adjustment</span>}
                  onChange={(active) =>
                    run(`/khata/adjustments/${adjustment.id}`, {
                      method: 'PATCH',
                      body: { active },
                    })
                  }
                />
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label="Delete adjustment"
                  onClick={() =>
                    window.confirm('Delete this adjustment?') &&
                    run(`/khata/adjustments/${adjustment.id}`, {
                      method: 'DELETE',
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="photos-title">
        <header className="card-head">
          <h2 id="photos-title">Old khata photos</h2>
          <PhotoUploader
            ownerType="khata_contact"
            ownerId={contact.id}
            label="Upload photo"
            onUploaded={() => reload()}
          />
        </header>
        {photos.length ? (
          <ul className="photo-strip">
            {photos.map((photo, index) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => setViewer(index)}
                  aria-label={`View photo ${index + 1}`}
                >
                  <img src={photoUrl(photo.id)} alt="" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">
            Keep a photo of the old notebook page next to the numbers.
          </p>
        )}
      </section>

      {sheet?.kind === 'entry' && (
        <EntrySheet
          contact={contact}
          entry={sheet.entry}
          direction={sheet.direction}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'adjust' && (
        <AdjustSheet contact={contact} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'import' && (
        <PersonImport contact={contact} onClose={() => setSheet(null)} />
      )}
      {viewer !== null && (
        <Lightbox
          photos={photos}
          index={viewer}
          onIndex={setViewer}
          busy={busy}
          onClose={() => setViewer(null)}
          onRemove={async (photo) => {
            if (
              window.confirm('Remove this photo? It cannot be undone.') &&
              (await run(`/photos/${photo.id}`, { method: 'DELETE' }))
            )
              setViewer(null);
          }}
        />
      )}
    </div>
  );
}
