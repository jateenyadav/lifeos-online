import { useState } from 'react';
import {
  Building2,
  CreditCard,
  Pencil,
  Plus,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { Sheet, Switch } from '../ui/Sheet.jsx';
import CountUp from '../ui/CountUp.jsx';
import { useAction, useLoad } from './client.js';
import { accountTypes, dayLabel, inr, parseRupees, toInput } from './format.js';
import {
  AmountInput,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
} from './parts.jsx';
import { Meter } from './charts.jsx';
import { listOf } from './TxnDrawer.jsx';

function AccountForm({ account, onClose }) {
  const [form, setForm] = useState(() => ({
    name: account?.name ?? '',
    type: account?.type ?? 'savings',
    bank: account?.bank ?? '',
    last4: account?.last4 ?? '',
    opening: account ? toInput(account.openingMinor) : '',
    ownerName: account?.ownerName ?? '',
    creditLimit: account ? toInput(account.creditLimitMinor) : '',
    bill: account ? toInput(account.billMinor) : '',
    minDue: account ? toInput(account.minDueMinor) : '',
    dueDate: account?.dueDate ?? '',
    statementDay: account?.statementDay ?? '',
  }));
  const { run, busy, error, setError } = useAction();
  const set = (key, value) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const card = form.type === 'credit_card';
  async function submit(event) {
    event.preventDefault();
    const money = (text) =>
      text.trim() === ''
        ? 0
        : parseRupees(text, { allowZero: true, allowNegative: true });
    const values = {
      openingMinor: money(form.opening),
      creditLimitMinor: money(form.creditLimit),
      billMinor: money(form.bill),
      minDueMinor: money(form.minDue),
    };
    if (Object.values(values).some((value) => value === null))
      return setError(
        'Check the amounts. Use numbers like 1,18,640 or 1186.40.',
      );
    if (form.last4 && !/^\d{4}$/.test(form.last4))
      return setError('Last digits must be 4 numbers.');
    const body = {
      name: form.name.trim(),
      type: form.type,
      bank: form.bank.trim(),
      last4: form.last4,
      openingMinor: values.openingMinor,
      ownerName: form.ownerName.trim() || null,
      ...(card
        ? {
            creditLimitMinor: values.creditLimitMinor,
            billMinor: values.billMinor,
            minDueMinor: values.minDueMinor,
            dueDate: form.dueDate || null,
            statementDay: form.statementDay ? Number(form.statementDay) : null,
          }
        : {}),
      ...(account?.needsConfirm ? { needsConfirm: false } : {}),
    };
    if (
      await run(account ? `/accounts/${account.id}` : '/accounts', {
        method: account ? 'PATCH' : 'POST',
        body,
      })
    )
      onClose();
  }
  return (
    <Sheet
      title={account ? `Edit ${account.name}` : 'Add an account or card'}
      onClose={onClose}
      busy={busy}
      wide
    >
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Name">
            <input
              required
              maxLength={60}
              autoFocus
              value={form.name}
              placeholder="HDFC Savings"
              onChange={(event) => set('name', event.target.value)}
            />
          </Field>
          <Field label="Type">
            <select
              value={form.type}
              onChange={(event) => set('type', event.target.value)}
            >
              {Object.entries(accountTypes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bank">
            <input
              maxLength={40}
              value={form.bank}
              onChange={(event) => set('bank', event.target.value)}
            />
          </Field>
          <Field label="Last 4 digits">
            <input
              inputMode="numeric"
              maxLength={4}
              value={form.last4}
              onChange={(event) =>
                set('last4', event.target.value.replace(/\D/g, ''))
              }
            />
          </Field>
          <AmountInput
            id="acc-opening"
            label={
              card
                ? 'Starting balance (negative = already owed)'
                : 'Starting balance (₹)'
            }
            value={form.opening}
            onChange={(value) => set('opening', value)}
            required={false}
          />
          {card && (
            <>
              <AmountInput
                id="acc-limit"
                label="Credit limit (₹)"
                value={form.creditLimit}
                onChange={(value) => set('creditLimit', value)}
                required={false}
              />
              <AmountInput
                id="acc-bill"
                label="Latest bill (₹)"
                value={form.bill}
                onChange={(value) => set('bill', value)}
                required={false}
              />
              <AmountInput
                id="acc-min"
                label="Minimum due (₹)"
                value={form.minDue}
                onChange={(value) => set('minDue', value)}
                required={false}
              />
              <Field label="Due date">
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => set('dueDate', event.target.value)}
                />
              </Field>
              <Field label="Statement day (1–31)">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.statementDay}
                  onChange={(event) => set('statementDay', event.target.value)}
                />
              </Field>
            </>
          )}
        </div>
        <Field
          label="Someone else's card or account? Owner's name"
          hint="Every payment on it is added to their khata. Its dues stay out of your net worth."
        >
          <input
            maxLength={80}
            value={form.ownerName}
            placeholder="Leave empty if it is yours"
            onChange={(event) => set('ownerName', event.target.value)}
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
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function CardTile({ account, onEdit, run, busy }) {
  const card = account.card ?? {
    outstanding: 0,
    available: account.creditLimitMinor,
    usagePct: 0,
    daysToDue: null,
    overdue: false,
  };
  const high = card.usagePct > 30;
  return (
    <article
      className="card credit-card"
      data-overdue={card.overdue || undefined}
      aria-label={`${account.name} credit card`}
    >
      <header className="cc-head">
        <span className="cc-chip" aria-hidden="true">
          <CreditCard size={18} />
        </span>
        <div>
          <h3>{account.name}</h3>
          <small>
            {account.bank} {account.last4 ? `•• ${account.last4}` : ''}
          </small>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={`Edit ${account.name}`}
          onClick={onEdit}
        >
          <Pencil size={15} />
        </button>
      </header>
      {account.ownerName && (
        <p className="owner-line">Someone else’s card · {account.ownerName}</p>
      )}
      <dl className="cc-numbers">
        <div>
          <dt>Outstanding</dt>
          <dd>{inr(card.outstanding)}</dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd>{inr(card.available)}</dd>
        </div>
        <div>
          <dt>Limit</dt>
          <dd>{inr(account.creditLimitMinor)}</dd>
        </div>
      </dl>
      <div className="cc-usage">
        <Meter
          value={card.outstanding}
          max={account.creditLimitMinor}
          tone={card.usagePct > 90 ? 'danger' : high ? 'warn' : 'ok'}
          label={`${card.usagePct}% of limit used`}
        />
        <span>{card.usagePct}% used</span>
      </div>
      {high && (
        <p className="hint">
          Using more than 30% of the limit can lower your credit score.
        </p>
      )}
      {account.billMinor > 0 && (
        <div className={`cc-bill ${card.overdue ? 'is-overdue' : ''}`}>
          <div>
            <span className="label">Bill</span>
            <strong>{inr(account.billMinor)}</strong>
            <small>Min due {inr(account.minDueMinor)}</small>
          </div>
          <div>
            <span className="label">Due</span>
            <strong>{account.dueDate ? dayLabel(account.dueDate) : '—'}</strong>
            <small>
              {account.billPaidAt
                ? `Paid ${dayLabel(account.billPaidAt)}`
                : card.overdue
                  ? `Overdue by ${Math.abs(card.daysToDue)} day${Math.abs(card.daysToDue) === 1 ? '' : 's'}`
                  : card.daysToDue != null
                    ? card.daysToDue === 0
                      ? 'Due today'
                      : `${card.daysToDue} day${card.daysToDue === 1 ? '' : 's'} left`
                    : ''}
            </small>
          </div>
          {!account.billPaidAt && !account.ownerName && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() =>
                run(`/accounts/${account.id}/bill-paid`, { method: 'POST' })
              }
            >
              Mark paid
            </button>
          )}
        </div>
      )}
      {card.cycleSpendMinor > 0 && (
        <p className="hint">Spent this cycle {inr(card.cycleSpendMinor)}</p>
      )}
    </article>
  );
}

export default function Accounts() {
  const { data, error, loading, reload } = useLoad('/accounts');
  const [editing, setEditing] = useState(null); // account | 'new'
  const { run, busy, error: actionError } = useAction();
  const accounts = listOf(data);
  const found = accounts.filter((account) => account.needsConfirm);
  const banks = accounts.filter(
    (account) => account.type !== 'credit_card' && !account.needsConfirm,
  );
  const cards = accounts.filter(
    (account) => account.type === 'credit_card' && !account.needsConfirm,
  );
  const total = banks
    .filter((account) => !account.ownerName)
    .reduce((sum, account) => sum + account.balanceMinor, 0);
  const owed = cards
    .filter((account) => !account.ownerName)
    .reduce((sum, account) => sum + (account.card?.outstanding ?? 0), 0);
  return (
    <div className="money-page">
      <ErrorNote
        message={error || actionError}
        onRetry={error ? reload : undefined}
      />
      {loading && !data && <Loading rows={4} label="Loading accounts…" />}
      {data && (
        <>
          {found.map((account) => (
            <div key={account.id} className="notice notice-info" role="status">
              <Sparkles size={18} aria-hidden="true" />
              <span>
                New account found: <b>{account.bank || account.name}</b>{' '}
                {account.last4 ? `•• ${account.last4}` : ''}. Is it yours?
              </span>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => setEditing(account)}
                >
                  Name it
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() =>
                    window.confirm(
                      'Remove this account? Its payments stay, without an account.',
                    ) && run(`/accounts/${account.id}`, { method: 'DELETE' })
                  }
                >
                  Not mine
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() =>
                    run(`/accounts/${account.id}`, {
                      method: 'PATCH',
                      body: { needsConfirm: false },
                    })
                  }
                >
                  Yes, add it
                </button>
              </div>
            </div>
          ))}
          <div className="stat-row">
            <section className="card stat-card">
              <span className="label">In your accounts</span>
              <strong className="mid-number">
                <CountUp value={total} format={inr} />
              </strong>
            </section>
            <section className="card stat-card">
              <span className="label">Owed on your cards</span>
              <strong className="mid-number text-out">
                <CountUp value={owed} format={inr} />
              </strong>
            </section>
          </div>
          <div className="toolbar">
            <h2 className="section-title">Bank, cash and wallets</h2>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditing('new')}
            >
              <Plus size={16} aria-hidden="true" /> Add account
            </button>
          </div>
          {banks.length ? (
            <div className="account-grid">
              {banks.map((account) => {
                const Icon =
                  account.type === 'cash' || account.type === 'wallet'
                    ? Wallet
                    : Building2;
                const differs =
                  !account.followBank &&
                  account.bankSaidMinor != null &&
                  account.bankSaidMinor !== account.balanceMinor;
                return (
                  <article
                    key={account.id}
                    className="card account-card"
                    aria-label={account.name}
                  >
                    <header className="cc-head">
                      <span className="cc-chip" aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h3>{account.name}</h3>
                        <small>
                          {accountTypes[account.type]}{' '}
                          {account.last4 ? `· •• ${account.last4}` : ''}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit ${account.name}`}
                        onClick={() => setEditing(account)}
                      >
                        <Pencil size={15} />
                      </button>
                    </header>
                    <strong className="mid-number">
                      {inr(account.balanceMinor)}
                    </strong>
                    {account.ownerName && (
                      <p className="owner-line">
                        Belongs to {account.ownerName}
                      </p>
                    )}
                    {differs && (
                      <div className="bank-diff">
                        <span>
                          Bank said {inr(account.bankSaidMinor)} vs app{' '}
                          {inr(account.balanceMinor)}
                        </span>
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          disabled={busy}
                          onClick={() =>
                            run(`/accounts/${account.id}/match-bank`, {
                              method: 'POST',
                            })
                          }
                        >
                          Match
                        </button>
                      </div>
                    )}
                    {account.type !== 'cash' && (
                      <Switch
                        checked={account.followBank}
                        onChange={(followBank) =>
                          run(`/accounts/${account.id}`, {
                            method: 'PATCH',
                            body: { followBank },
                          })
                        }
                        label="Follow the bank's balance"
                        hint={
                          account.followBank
                            ? 'The Android app moves the balance to match bank SMS.'
                            : 'Keeps your own number and shows the difference.'
                        }
                      />
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Building2}
              title="No accounts yet"
              detail="Add a bank account to see balances."
            />
          )}
          <h2 className="section-title">Credit cards</h2>
          {cards.length ? (
            <div className="account-grid">
              {cards.map((account) => (
                <CardTile
                  key={account.id}
                  account={account}
                  run={run}
                  busy={busy}
                  onEdit={() => setEditing(account)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CreditCard}
              title="No cards yet"
              detail="Add a card to track its bill and due date."
            />
          )}
        </>
      )}
      {editing && (
        <AccountForm
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
