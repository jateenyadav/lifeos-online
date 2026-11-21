import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { query, useLoad, useMoney } from './client.js';
import { allCategories, inr, sourceLabels, sources } from './format.js';
import TxnDrawer, { listOf, TxnForm } from './TxnDrawer.jsx';
import { EmptyState, ErrorNote, Field, Loading, TxnRow } from './parts.jsx';

const blankFilters = {
  from: '',
  to: '',
  accountId: '',
  category: '',
  direction: '',
  source: '',
  status: '',
  review: false,
  left: false,
};

export default function Transactions({ initialQuery = '' }) {
  const [filters, setFilters] = useState(blankFilters);
  const [search, setSearch] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [pages, setPages] = useState({ base: null, items: [], cursor: null });
  const { call } = useMoney();
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const path = `/txns${query({ ...filters, q, limit: 50 })}`;
  const { data, error, loading, reload } = useLoad(path);
  const { data: accountData } = useLoad('/accounts');
  const accounts = listOf(accountData);
  const extra = pages.base === data ? pages : { items: [], cursor: null };
  const items = useMemo(
    () => [...listOf(data), ...extra.items],
    [data, extra.items],
  );
  const nextCursor = extra.cursor ?? data?.nextCursor ?? null;
  const set = (key, value) =>
    setFilters((previous) => ({ ...previous, [key]: value }));
  const active = Object.entries(filters).filter(
    ([key, value]) => value !== blankFilters[key],
  ).length;
  const totals = items.reduce(
    (sum, txn) => {
      if (txn.status === 'cleared' && !txn.isTransfer)
        sum[txn.direction] += txn.ownMinor ?? txn.amountMinor;
      return sum;
    },
    { debit: 0, credit: 0 },
  );
  async function more() {
    const result = await call(
      `/txns${query({ ...filters, q, limit: 50, cursor: nextCursor })}`,
    );
    setPages({
      base: data,
      items: [...extra.items, ...listOf(result)],
      cursor: result.nextCursor ?? null,
    });
  }
  return (
    <div className="money-page">
      <div className="toolbar">
        <label className="search-box">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search payments</span>
          <input
            type="search"
            placeholder="Search payments, people, notes…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-quiet"
          aria-expanded={showFilters}
          aria-controls="txn-filters"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" /> Filters
          {active ? ` (${active})` : ''}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setAdding(true)}
        >
          <Plus size={16} aria-hidden="true" /> Add
        </button>
      </div>
      <div className="quick-filters" role="group" aria-label="Quick filters">
        {[
          ['', 'All'],
          ['debit', 'Money out'],
          ['credit', 'Money in'],
        ].map(([value, label]) => (
          <button
            key={label}
            type="button"
            className="chip"
            aria-pressed={filters.direction === value}
            onClick={() => set('direction', value)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={filters.review}
          onClick={() => set('review', !filters.review)}
        >
          Needs review
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={filters.left}
          onClick={() => set('left', !filters.left)}
        >
          Left for later
        </button>
      </div>
      {showFilters && (
        <section
          id="txn-filters"
          className="card filter-card"
          aria-label="Filters"
        >
          <div className="form-grid four">
            <Field label="From">
              <input
                type="date"
                value={filters.from}
                onChange={(event) => set('from', event.target.value)}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={filters.to}
                onChange={(event) => set('to', event.target.value)}
              />
            </Field>
            <Field label="Account">
              <select
                value={filters.accountId}
                onChange={(event) => set('accountId', event.target.value)}
              >
                <option value="">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select
                value={filters.category}
                onChange={(event) => set('category', event.target.value)}
              >
                <option value="">All categories</option>
                {allCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>
            <Field label="Came from">
              <select
                value={filters.source}
                onChange={(event) => set('source', event.target.value)}
              >
                <option value="">Anywhere</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {sourceLabels[source]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={filters.status}
                onChange={(event) => set('status', event.target.value)}
              >
                <option value="">Any status</option>
                <option value="cleared">Done</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </Field>
          </div>
          {active > 0 && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setFilters(blankFilters)}
            >
              <X size={14} aria-hidden="true" /> Clear filters
            </button>
          )}
        </section>
      )}
      <ErrorNote message={error} onRetry={reload} />
      {loading && !data ? (
        <Loading rows={6} label="Loading payments…" />
      ) : (
        <section className="card list-card" aria-label="Payments">
          <header className="list-summary">
            <span>
              {items.length} payment{items.length === 1 ? '' : 's'}
              {nextCursor ? '+' : ''}
            </span>
            <span>
              Out <b className="text-out">{inr(totals.debit)}</b> · In{' '}
              <b className="text-in">{inr(totals.credit)}</b>
            </span>
          </header>
          {items.length ? (
            <ul className="txn-list">
              {items.map((txn) => (
                <TxnRow
                  key={txn.id}
                  txn={txn}
                  accounts={accounts}
                  onOpen={setOpen}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              title={q || active ? 'No payments match' : 'No payments yet'}
              detail={
                q || active
                  ? 'Try fewer filters or another word.'
                  : 'Add your first payment by hand.'
              }
            >
              {!q && !active && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setAdding(true)}
                >
                  Add a payment
                </button>
              )}
            </EmptyState>
          )}
          {nextCursor && (
            <button
              type="button"
              className="btn btn-quiet load-more"
              onClick={more}
            >
              Show more
            </button>
          )}
        </section>
      )}
      {open && (
        <TxnDrawer
          key={open.id}
          txn={open}
          accounts={accounts}
          onClose={() => setOpen(null)}
        />
      )}
      {adding && <TxnForm onClose={() => setAdding(false)} />}
    </div>
  );
}
