import { ChevronLeft, ChevronRight, CircleAlert, Inbox } from 'lucide-react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BadgeIndianRupee,
  Banknote,
  Bus,
  Car,
  Clapperboard,
  Fuel,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import {
  dayLabel,
  inr,
  monthKey,
  monthLabel,
  shiftMonth,
  sourceLabels,
} from './format.js';

export const categoryIcons = {
  Food: Utensils,
  Groceries: ShoppingCart,
  Travel: Bus,
  Fuel,
  Shopping: ShoppingBag,
  Bills: Receipt,
  Rent: Home,
  Health: HeartPulse,
  Entertainment: Clapperboard,
  Education: GraduationCap,
  Investments: TrendingUp,
  Salary: Banknote,
  Refund: ArrowDownLeft,
  Interest: BadgeIndianRupee,
  Gift: Sparkles,
  'Other income': HandCoins,
  Cab: Car,
};

/** Coloured amount: money out is coral with "−", money in is mint with "+". */
export function Amount({ minor, direction, className = '', strike = false }) {
  const out = direction === 'debit';
  return (
    <span
      className={`amount ${out ? 'is-out' : 'is-in'} ${strike ? 'is-muted' : ''} ${className}`}
    >
      <span className="sr-only">{out ? 'Money out ' : 'Money in '}</span>
      {out ? '−' : '+'}
      {inr(minor)}
    </span>
  );
}

export function MonthPicker({ month, onChange }) {
  const current = monthKey();
  return (
    <div className="month-picker" role="group" aria-label="Choose month">
      <button
        type="button"
        className="icon-button"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft size={18} />
      </button>
      <label>
        <span className="sr-only">Month</span>
        <input
          type="month"
          value={month}
          max={current}
          onChange={(event) =>
            event.target.value && onChange(event.target.value)
          }
        />
        <strong aria-hidden="true">{monthLabel(month)}</strong>
      </label>
      <button
        type="button"
        className="icon-button"
        aria-label="Next month"
        disabled={month >= current}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

export function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="notice notice-danger" role="alert">
      <CircleAlert size={18} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function Loading({ rows = 3, label = 'Loading…' }) {
  return (
    <div className="loading-block" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="skeleton skeleton-line"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, detail, children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {children}
    </div>
  );
}

const peerLabels = {
  lent: 'They owe me',
  split: 'Split',
  repaid: 'Paid back',
  borrowed: 'Borrowed',
  got_back: 'Got back',
  owe_owner: 'Their card',
  personal: 'Just mine',
  left: 'Left for later',
};

export function TxnRow({ txn, accounts = [], onOpen }) {
  const Icon = txn.isTransfer
    ? ArrowLeftRight
    : (categoryIcons[txn.category] ??
      (txn.direction === 'credit' ? ArrowDownLeft : ArrowUpRight));
  const account = accounts.find((entry) => entry.id === txn.accountId);
  const partial =
    txn.ownMinor != null && txn.ownMinor !== txn.amountMinor && !txn.isTransfer;
  return (
    <li>
      <button type="button" className="txn-row" onClick={() => onOpen(txn)}>
        {txn.isPerson ? (
          <Avatar name={txn.counterparty || txn.title} size={40} />
        ) : (
          <span className="txn-icon" data-cat={txn.category} aria-hidden="true">
            <Icon size={18} />
          </span>
        )}
        <span className="txn-main">
          <strong>{txn.title || txn.counterparty || 'Payment'}</strong>
          <small>
            {dayLabel(txn.date)}
            {txn.time ? ` · ${txn.time}` : ''} ·{' '}
            {txn.isTransfer ? 'Transfer' : txn.category}
            {account ? ` · ${account.name}` : ''}
          </small>
          <span className="txn-badges">
            {txn.needsReview && <span className="badge badge-warn">Check</span>}
            {txn.status !== 'cleared' && (
              <span className="badge">
                {txn.status === 'pending' ? 'Pending' : 'Failed'}
              </span>
            )}
            {txn.peerTag && (
              <span className="badge badge-info">
                {peerLabels[txn.peerTag]}
              </span>
            )}
            {txn.reimburseTag === 'claim' && (
              <span className="badge badge-teal">
                {txn.reimbursedById ? 'Got back' : 'Claimed'}
              </span>
            )}
            {txn.reimburseTag === 'received' && (
              <span className="badge badge-teal">Reimbursement</span>
            )}
            {txn.refundOfId && <span className="badge badge-teal">Refund</span>}
            {txn.source !== 'manual' && (
              <span className="badge badge-quiet">
                {sourceLabels[txn.source] ?? txn.source}
              </span>
            )}
          </span>
        </span>
        <span className="txn-amount">
          <Amount
            minor={txn.amountMinor}
            direction={txn.direction}
            strike={txn.isTransfer || txn.status !== 'cleared'}
          />
          {partial && <small>Yours {inr(txn.ownMinor)}</small>}
        </span>
      </button>
    </li>
  );
}

/** Amount input that accepts "1,186.40". */
export function AmountInput({
  id,
  value,
  onChange,
  label = 'Amount (₹)',
  autoFocus,
  required = true,
  placeholder = '0',
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="amount-input" data-symbol="₹">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          required={required}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function Card({
  title,
  action,
  children,
  className = '',
  as: Tag = 'section',
  ...rest
}) {
  return (
    <Tag className={`card ${className}`} {...rest}>
      {(title || action) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </Tag>
  );
}
