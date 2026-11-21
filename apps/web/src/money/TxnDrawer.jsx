import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Camera,
  HandCoins,
  Link2,
  Pencil,
  RotateCcw,
  Trash2,
  Undo2,
  Unlink,
  Users,
} from 'lucide-react';
import { apiBase } from '../api.js';
import { Chips, Sheet } from '../ui/Sheet.jsx';
import Avatar from '../ui/Avatar.jsx';
import { dateKey } from '../workspaces/utils.js';
import { query, useAction, useLoad, useMoney } from './client.js';
import {
  accountTypes,
  channels,
  dayLabel,
  expenseCategories,
  incomeCategories,
  inr,
  longDay,
  parseRupees,
  purposes,
  sourceLabels,
  toInput,
} from './format.js';
import { downscaleImage } from './photo.js';
import { Amount, AmountInput, Field } from './parts.jsx';

export const unwrap = (result, key) =>
  result && typeof result === 'object' && key in result ? result[key] : result;
export const listOf = (result) =>
  Array.isArray(result) ? result : (result?.items ?? []);

/** Add or edit a payment by hand. */
export function TxnForm({ txn, onClose, onSaved }) {
  const { data: accountData } = useLoad('/accounts');
  const accounts = listOf(accountData);
  const [form, setForm] = useState(() => ({
    direction: txn?.direction ?? 'debit',
    amount: txn ? toInput(txn.amountMinor) : '',
    title: txn?.title ?? '',
    date: txn?.date ?? dateKey(),
    category: txn?.category ?? 'Food',
    accountId: txn?.accountId ?? '',
    channel: txn?.channel ?? 'UPI',
    status: txn?.status ?? 'cleared',
    note: txn?.note ?? '',
  }));
  const { run, busy, error, setError } = useAction();
  const set = (key, value) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const categories =
    form.direction === 'debit' ? expenseCategories : incomeCategories;
  async function submit(event) {
    event.preventDefault();
    const amountMinor = parseRupees(form.amount);
    if (!amountMinor) return setError('Enter an amount like 1,186.40.');
    if (!form.title.trim())
      return setError('Say what it was, for example “Lunch”.');
    const body = {
      direction: form.direction,
      amountMinor,
      title: form.title.trim(),
      date: form.date,
      category: categories.includes(form.category)
        ? form.category
        : categories.at(-1),
      accountId: form.accountId || null,
      channel: form.channel,
      note: form.note,
      ...(txn ? { status: form.status } : {}),
    };
    const result = await run(txn ? `/txns/${txn.id}` : '/txns', {
      method: txn ? 'PATCH' : 'POST',
      body,
    });
    if (result) {
      const saved = unwrap(result, 'txn');
      onSaved?.(saved && saved.id ? saved : { ...txn, ...body });
      onClose();
    }
  }
  return (
    <Sheet
      title={txn ? 'Edit payment' : 'Add a payment'}
      onClose={onClose}
      busy={busy}
    >
      <form className="form" onSubmit={submit}>
        <Chips
          label="Money in or out"
          value={form.direction}
          onChange={(value) => {
            set('direction', value);
            set('category', value === 'debit' ? 'Food' : 'Salary');
          }}
          options={[
            { value: 'debit', label: 'Money out' },
            { value: 'credit', label: 'Money in' },
          ]}
        />
        <div className="form-grid">
          <AmountInput
            id="txn-amount"
            value={form.amount}
            onChange={(value) => set('amount', value)}
            autoFocus
          />
          <Field label="What was it?">
            <input
              required
              maxLength={120}
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              placeholder="Lunch, rent, salary…"
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) => set('date', event.target.value)}
            />
          </Field>
          <Field label="Category">
            <select
              value={form.category}
              onChange={(event) => set('category', event.target.value)}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </Field>
          <Field label="Account">
            <select
              value={form.accountId}
              onChange={(event) => set('accountId', event.target.value)}
            >
              <option value="">No account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Paid with">
            <select
              value={form.channel}
              onChange={(event) => set('channel', event.target.value)}
            >
              {channels.map((channel) => (
                <option key={channel}>{channel}</option>
              ))}
            </select>
          </Field>
          {txn && (
            <Field label="Status">
              <select
                value={form.status}
                onChange={(event) => set('status', event.target.value)}
              >
                <option value="cleared">Done</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </Field>
          )}
        </div>
        <Field label="Note">
          <textarea
            rows={2}
            maxLength={2000}
            value={form.note}
            onChange={(event) => set('note', event.target.value)}
          />
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
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

const debitAnswers = [
  { value: 'lent', label: 'They owe me' },
  { value: 'split', label: 'Split the bill' },
  { value: 'owe_owner', label: 'I owe them / paid with their card' },
  { value: 'repaid', label: 'I was paying back' },
  { value: 'personal', label: 'Just mine' },
  { value: 'left', label: 'Just leave it' },
];
const creditAnswers = [
  { value: 'got_back', label: 'They paid me back' },
  { value: 'borrowed', label: 'I borrowed' },
  { value: 'owe_owner', label: 'Refund on their card' },
  { value: 'personal', label: 'Just mine' },
  { value: 'left', label: 'Just leave it' },
];

function PeerQuestion({ txn, onChanged }) {
  const name = txn.counterparty || txn.title;
  const [choice, setChoice] = useState(txn.peerTag ?? '');
  const [person, setPerson] = useState(name);
  const [people, setPeople] = useState(txn.splitPeople ?? 2);
  const { run, busy, error } = useAction();
  const answers = txn.direction === 'debit' ? debitAnswers : creditAnswers;
  const needsPerson = choice && !['personal', 'left'].includes(choice);
  const share =
    choice === 'split'
      ? txn.amountMinor - Math.floor(txn.amountMinor / people)
      : txn.amountMinor;
  async function save(peerTag = choice) {
    const body = { peerTag: peerTag || null };
    if (peerTag && !['personal', 'left'].includes(peerTag))
      body.contactName = person.trim() || name;
    if (peerTag === 'split') body.splitPeople = people;
    const result = await run(`/txns/${txn.id}/peer`, { method: 'POST', body });
    if (result)
      onChanged(result, {
        peerTag: body.peerTag,
        splitPeople: body.splitPeople ?? null,
      });
  }
  return (
    <section className="drawer-section" aria-labelledby="peer-title">
      <h3 id="peer-title">
        <Users size={16} aria-hidden="true" />
        {txn.direction === 'debit'
          ? `Does ${name} owe you?`
          : `Why did ${name} send this?`}
      </h3>
      <Chips
        label="Your answer"
        value={choice}
        onChange={setChoice}
        options={answers}
        size="sm"
      />
      {needsPerson && (
        <Field label="Person in Khata">
          <input
            value={person}
            maxLength={80}
            onChange={(event) => setPerson(event.target.value)}
          />
        </Field>
      )}
      {choice === 'split' && (
        <div className="stepper-row">
          <span>People sharing, including you</span>
          <div className="stepper" role="group" aria-label="People sharing">
            <button
              type="button"
              className="icon-button"
              aria-label="Fewer people"
              disabled={people <= 2}
              onClick={() => setPeople(people - 1)}
            >
              −
            </button>
            <output aria-live="polite">{people}</output>
            <button
              type="button"
              className="icon-button"
              aria-label="More people"
              disabled={people >= 6}
              onClick={() => setPeople(people + 1)}
            >
              +
            </button>
          </div>
        </div>
      )}
      {needsPerson && choice !== 'owe_owner' && (
        <p className="hint">
          {choice === 'split'
            ? `Others owe you ${inr(share)}. Your part is ${inr(txn.amountMinor - share)}.`
            : `${inr(share)} goes into ${person || name}'s khata and stops counting as your ${txn.direction === 'debit' ? 'spending' : 'income'}.`}
        </p>
      )}
      {choice === 'owe_owner' && (
        <p className="hint">
          Still your spending. {person || name}&apos;s khata shows you owe them.
        </p>
      )}
      {choice === 'left' && (
        <p className="hint">
          It waits in Khata → Left for later until you decide.
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="row-actions">
        {txn.peerTag && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => save(null)}
          >
            Clear answer
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={
            busy || !choice || (choice === txn.peerTag && choice !== 'split')
          }
          onClick={() => save()}
        >
          {busy ? 'Saving…' : 'Save answer'}
        </button>
      </div>
    </section>
  );
}

function ReimburseTile({ txn, onChanged }) {
  const own = txn.amountMinor - (txn.peerShareMinor || 0);
  const [claiming, setClaiming] = useState(false);
  const [amount, setAmount] = useState(toInput(own));
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState([]);
  const [preview, setPreview] = useState(null);
  const { call } = useMoney();
  const { run, busy, error, setError } = useAction();
  const { data: claimsData } = useLoad(picking ? '/reimbursements' : null);
  const waiting = (claimsData?.items ?? []).filter((item) => item.waiting);

  useEffect(() => {
    if (!picking || !chosen.length) return undefined;
    let live = true;
    call(`/txns/${txn.id}/reimburse/preview`, {
      method: 'POST',
      body: { claimIds: chosen },
    })
      .then((result) => live && setPreview(result))
      .catch((failure) => live && setError(failure.message));
    return () => {
      live = false;
    };
  }, [chosen, picking, txn.id, call, setError]);

  async function claim(event) {
    event.preventDefault();
    const amountMinor = parseRupees(amount);
    if (!amountMinor || amountMinor > own)
      return setError(`Enter up to ${inr(own)}, your own part.`);
    const result = await run(`/txns/${txn.id}/reimburse/claim`, {
      method: 'POST',
      body: { amountMinor },
    });
    if (result) {
      setClaiming(false);
      onChanged(result, { reimburseTag: 'claim', reimburseMinor: amountMinor });
    }
  }
  async function act(path, method, body, patch) {
    const result = await run(path, { method, body });
    if (result) onChanged(result, patch);
    return result;
  }

  if (txn.direction === 'debit') {
    if (txn.reimburseTag === 'claim')
      return (
        <section className="drawer-section tile tile-teal">
          <h3>
            <HandCoins size={16} aria-hidden="true" />{' '}
            {txn.reimbursedById ? 'Got back' : 'Waiting to get back'}
          </h3>
          <p className="tile-number">{inr(txn.reimburseMinor)}</p>
          {txn.peerTag === 'owe_owner' && !txn.reimbursedById && (
            <p className="hint">
              Paid with {txn.counterparty || 'their'}&apos;s card: pay them back
              in Khata when the money comes.
            </p>
          )}
          {!txn.reimbursedById && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() =>
                act(`/txns/${txn.id}/reimburse/claim`, 'DELETE', undefined, {
                  reimburseTag: null,
                  reimburseMinor: 0,
                })
              }
            >
              Cancel claim
            </button>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </section>
      );
    return (
      <section className="drawer-section tile">
        <h3>
          <HandCoins size={16} aria-hidden="true" /> Will you get this back?
        </h3>
        {!claiming ? (
          <>
            <p className="hint">
              Office travel, a friend paying later… Claimed money stops counting
              as spending while you wait.
            </p>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setClaiming(true)}
            >
              Yes, I will get it back
            </button>
          </>
        ) : (
          <form className="form" onSubmit={claim} aria-label="Claim sheet">
            <AmountInput
              id="claim-amount"
              label="How much will come back?"
              value={amount}
              onChange={setAmount}
              autoFocus
            />
            <p className="hint">Up to {inr(own)} (your own part).</p>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <div className="row-actions">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setClaiming(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" disabled={busy}>
                Save claim
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }
  if (txn.reimburseTag === 'received')
    return (
      <section className="drawer-section tile tile-teal">
        <h3>
          <HandCoins size={16} aria-hidden="true" /> Reimbursement
        </h3>
        <p className="hint">
          Pays back {inr(txn.reimburseMinor)}
          {txn.amountMinor > txn.reimburseMinor
            ? ` · Extra ${inr(txn.amountMinor - txn.reimburseMinor)} is yours`
            : ''}
        </p>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={() =>
            act(`/txns/${txn.id}/reimburse/received`, 'DELETE', undefined, {
              reimburseTag: null,
              reimburseMinor: 0,
            })
          }
        >
          <Undo2 size={14} aria-hidden="true" /> Undo
        </button>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  return (
    <section className="drawer-section tile">
      <h3>
        <HandCoins size={16} aria-hidden="true" /> Is this a reimbursement?
      </h3>
      {!picking ? (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => setPicking(true)}
        >
          Pick what it pays back
        </button>
      ) : (
        <>
          {!claimsData && <p className="hint">Loading claims…</p>}
          {claimsData && !waiting.length && (
            <p className="hint">
              No claims are waiting. Mark a payment “Will you get this back?”
              first.
            </p>
          )}
          <fieldset className="check-list">
            <legend className="sr-only">Claims this money pays back</legend>
            {waiting.map(({ txn: claimTxn }) => (
              <label key={claimTxn.id} className="check-row">
                <input
                  type="checkbox"
                  checked={chosen.includes(claimTxn.id)}
                  onChange={(event) =>
                    setChosen(
                      event.target.checked
                        ? [...chosen, claimTxn.id]
                        : chosen.filter((value) => value !== claimTxn.id),
                    )
                  }
                />
                <span>
                  {claimTxn.title} · {dayLabel(claimTxn.date)}
                </span>
                <b>{inr(claimTxn.reimburseMinor)}</b>
              </label>
            ))}
          </fieldset>
          {preview && chosen.length > 0 && (
            <p className="preview-line" role="status">
              Pays back {inr(preview.matchedMinor)}
              {preview.extraMinor > 0 &&
                ` · Extra ${inr(preview.extraMinor)} is yours`}
              {preview.shortMinor > 0 &&
                ` · ${inr(preview.shortMinor)} short: that part counts as spending again`}
            </p>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setPicking(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !chosen.length}
              onClick={async () => {
                if (
                  await act(
                    `/txns/${txn.id}/reimburse/received`,
                    'POST',
                    { claimIds: chosen },
                    {
                      reimburseTag: 'received',
                      reimburseMinor: preview?.matchedMinor ?? 0,
                    },
                  )
                )
                  setPicking(false);
              }}
            >
              Save reimbursement
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function LinksSection({ txn, onChanged }) {
  const [mode, setMode] = useState(null); // 'refund' | 'transfer'
  const { run, busy, error } = useAction();
  const from =
    mode === 'transfer' ? shiftDay(txn.date, -3) : shiftDay(txn.date, -120);
  const to = mode === 'transfer' ? shiftDay(txn.date, 3) : txn.date;
  const path =
    mode &&
    `/txns${query({
      direction:
        mode === 'refund'
          ? 'debit'
          : txn.direction === 'debit'
            ? 'credit'
            : 'debit',
      from,
      to,
      limit: 40,
    })}`;
  const { data } = useLoad(path || null);
  const candidates = listOf(data).filter(
    (other) =>
      other.id !== txn.id &&
      (mode !== 'transfer' || other.amountMinor === txn.amountMinor),
  );
  async function act(apiPath, method, body, patch) {
    const result = await run(apiPath, { method, body });
    if (result) {
      setMode(null);
      onChanged(result, patch);
    }
  }
  return (
    <section className="drawer-section">
      <h3>
        <Link2 size={16} aria-hidden="true" /> Links
      </h3>
      {txn.isTransfer ? (
        <div className="link-state">
          <ArrowLeftRight size={16} aria-hidden="true" />
          <span>
            {txn.transferId
              ? 'Moved between your own accounts. Not spending.'
              : 'Sent to your untracked account. Not spending.'}
          </span>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() =>
              act(`/txns/${txn.id}/transfer`, 'DELETE', undefined, {
                isTransfer: false,
                transferId: null,
              })
            }
          >
            <Unlink size={14} aria-hidden="true" /> Unlink
          </button>
        </div>
      ) : txn.refundOfId ? (
        <div className="link-state">
          <RotateCcw size={16} aria-hidden="true" />
          <span>Refund of an earlier payment. It lowers your spending.</span>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() =>
              act(
                `/txns/${txn.id}/refund-of`,
                'POST',
                { originalId: null },
                { refundOfId: null },
              )
            }
          >
            Not a refund
          </button>
        </div>
      ) : (
        <div className="row-actions wrap">
          {txn.direction === 'credit' && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              aria-pressed={mode === 'refund'}
              onClick={() => setMode(mode === 'refund' ? null : 'refund')}
            >
              It is a refund
            </button>
          )}
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-pressed={mode === 'transfer'}
            onClick={() => setMode(mode === 'transfer' ? null : 'transfer')}
          >
            Link to my other account
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() =>
              act(
                `/txns/${txn.id}/transfer`,
                'POST',
                { untracked: true },
                { isTransfer: true, transferId: null },
              )
            }
          >
            Transfer to my untracked account
          </button>
        </div>
      )}
      {mode && (
        <ul
          className="pick-list"
          aria-label={
            mode === 'refund'
              ? 'Pick the original payment'
              : 'Pick the matching payment'
          }
        >
          {!data && <li className="hint">Loading…</li>}
          {data && !candidates.length && (
            <li className="hint">
              {mode === 'transfer'
                ? 'No payment with the same amount within 3 days.'
                : 'No earlier payments found.'}
            </li>
          )}
          {candidates.map((other) => (
            <li key={other.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  mode === 'refund'
                    ? act(
                        `/txns/${txn.id}/refund-of`,
                        'POST',
                        { originalId: other.id },
                        { refundOfId: other.id },
                      )
                    : act(
                        `/txns/${txn.id}/transfer`,
                        'POST',
                        { otherId: other.id },
                        { isTransfer: true, transferId: 'linked' },
                      )
                }
              >
                <span>
                  {other.title} · {dayLabel(other.date)}
                </span>
                <Amount minor={other.amountMinor} direction={other.direction} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function shiftDay(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dateKey(value);
}

export function PhotoUploader({
  ownerType,
  ownerId,
  onUploaded,
  label = 'Add photo',
}) {
  const { call } = useMoney();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function pick(event) {
    const files = [...event.target.files];
    event.target.value = '';
    setError('');
    setBusy(true);
    try {
      for (const file of files) {
        const image = await downscaleImage(file, 1600);
        const result = await call('/photos', {
          method: 'POST',
          body: {
            ownerType,
            ownerId: ownerId ?? null,
            mime: image.mime,
            data: image.data,
            caption: file.name.slice(0, 80),
          },
        });
        onUploaded?.(result.id, file.name);
      }
    } catch (failure) {
      setError(failure.message || 'Could not add this picture.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="uploader">
      <label className={`btn btn-quiet btn-sm ${busy ? 'is-busy' : ''}`}>
        <Camera size={15} aria-hidden="true" />
        {busy ? 'Adding…' : label}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={pick}
        />
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const photoUrl = (id) => `${apiBase()}/money/photos/${id}`;

/** The detail drawer for one payment. */
export default function TxnDrawer({ txn: initial, onClose, accounts = [] }) {
  const [txn, setTxn] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [askPeer, setAskPeer] = useState(false);
  const [photos, setPhotos] = useState(initial.photos ?? []);
  const [note, setNote] = useState(initial.note ?? '');
  const { run, busy, error } = useAction();
  const account = accounts.find((entry) => entry.id === txn.accountId);
  const changed = (result, patch = {}) => {
    const updated = unwrap(result, 'txn');
    setTxn(
      updated && updated.id
        ? updated
        : (previous) => ({ ...previous, ...patch }),
    );
  };
  async function patch(body) {
    const result = await run(`/txns/${txn.id}`, { method: 'PATCH', body });
    if (result) changed(result, body);
  }
  if (editing)
    return (
      <TxnForm
        txn={txn}
        onClose={() => setEditing(false)}
        onSaved={(saved) => setTxn(saved)}
      />
    );
  const categories =
    txn.direction === 'debit' ? expenseCategories : incomeCategories;
  return (
    <Sheet
      title={txn.title || 'Payment'}
      onClose={onClose}
      side="right"
      busy={busy}
    >
      <div className="drawer-hero">
        {txn.isPerson ? (
          <Avatar name={txn.counterparty || txn.title} size={48} />
        ) : null}
        <div>
          <Amount
            minor={txn.amountMinor}
            direction={txn.direction}
            className="drawer-amount"
          />
          <p className="hint">
            {longDay(txn.date)}
            {txn.time ? ` · ${txn.time}` : ''} · {txn.channel}
            {account
              ? ` · ${account.name}${account.type ? ` (${accountTypes[account.type] ?? account.type})` : ''}`
              : ''}
          </p>
          <p className="hint">
            {sourceLabels[txn.source] ?? txn.source}
            {txn.status !== 'cleared'
              ? ` · ${txn.status === 'pending' ? 'Pending' : 'Failed'}: counts nowhere`
              : ''}
            {txn.ownMinor != null && txn.ownMinor !== txn.amountMinor
              ? ` · Your part ${inr(txn.ownMinor)}`
              : ''}
          </p>
        </div>
        <div className="drawer-tools">
          <button
            type="button"
            className="icon-button"
            aria-label="Edit payment"
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="icon-button danger"
            aria-label="Delete payment"
            disabled={busy}
            onClick={async () => {
              if (
                window.confirm(
                  `Delete “${txn.title}”? Linked khata entries and photos go too.`,
                )
              )
                if (await run(`/txns/${txn.id}`, { method: 'DELETE' }))
                  onClose();
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {txn.needsReview && (
        <div className="notice notice-warn">
          <span>
            LifeOS was not sure about this one. Check it, then confirm.
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => patch({ needsReview: false })}
          >
            Looks right
          </button>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <section className="drawer-section">
        <h3>Category</h3>
        <Chips
          label="Category"
          size="sm"
          value={txn.category}
          onChange={(category) => patch({ category })}
          options={categories.map((category) => ({
            value: category,
            label: category,
          }))}
        />
      </section>
      <section className="drawer-section">
        <h3>What was it for?</h3>
        <Chips
          label="What was it for?"
          size="sm"
          value={txn.purpose}
          onChange={(purpose) =>
            patch({ purpose: purpose === txn.purpose ? '' : purpose })
          }
          options={purposes.map((purpose) => ({
            value: purpose,
            label: purpose,
          }))}
        />
      </section>
      <section className="drawer-section">
        <Field label="Note">
          <textarea
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        {note !== (txn.note ?? '') && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => patch({ note })}
          >
            Save note
          </button>
        )}
      </section>
      {txn.isPerson || txn.peerTag || askPeer ? (
        <PeerQuestion
          key={`${txn.id}-${txn.peerTag}`}
          txn={txn}
          onChanged={changed}
        />
      ) : (
        <button
          type="button"
          className="btn btn-quiet btn-sm drawer-ask"
          onClick={() => setAskPeer(true)}
        >
          <Users size={15} aria-hidden="true" /> This involved a person
        </button>
      )}
      {!txn.isTransfer && (
        <ReimburseTile
          key={`${txn.id}-${txn.reimburseTag}`}
          txn={txn}
          onChanged={changed}
        />
      )}
      <LinksSection txn={txn} onChanged={changed} />
      <section className="drawer-section">
        <h3>
          <Camera size={16} aria-hidden="true" /> Receipt photos
        </h3>
        {photos.length > 0 && (
          <ul className="photo-strip">
            {photos.map((photo) => (
              <li key={photo.id}>
                <img
                  src={photoUrl(photo.id)}
                  alt={photo.caption || 'Receipt photo'}
                  loading="lazy"
                />
              </li>
            ))}
          </ul>
        )}
        <PhotoUploader
          ownerType="txn"
          ownerId={txn.id}
          label="Add receipt"
          onUploaded={(id, caption) =>
            setPhotos((list) => [...list, { id, caption }])
          }
        />
      </section>
    </Sheet>
  );
}
