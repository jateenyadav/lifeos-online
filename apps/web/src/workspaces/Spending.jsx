import { useState } from 'react';
import {
  CalendarDays,
  Download,
  HeartPulse,
  PiggyBank,
  Receipt,
  ShoppingBag,
  Sparkles,
  TramFront,
  Utensils,
  Wallet,
} from 'lucide-react';
import MoneyHub from './MoneyHub.jsx';
import {
  dateKey,
  displayDate,
  expenseCategories,
  expenseCsv,
  money,
  parseMoney,
} from './utils.js';
import {
  deleteEntry,
  Editor,
  Empty,
  Field,
  Filters,
  RecordActions,
  SpaceHeading,
  Stat,
} from './shared.jsx';

const categoryIcons = {
  Food: Utensils,
  Travel: TramFront,
  Shopping: ShoppingBag,
  Bills: Receipt,
  Health: HeartPulse,
  Other: Sparkles,
};
const blank = () => ({
  title: '',
  date: dateKey(),
  amount: '',
  category: 'Food',
  payment: 'UPI',
  note: '',
});
export default function Spending({ store, create = false }) {
  const [editor, setEditor] = useState(create ? blank() : null);
  const [month, setMonth] = useState(dateKey().slice(0, 7));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [budgetEditor, setBudgetEditor] = useState(null);
  const [localError, setLocalError] = useState('');
  const entries = store.data.expenses.filter((entry) =>
    entry.date.startsWith(month),
  );
  const total = entries.reduce((sum, entry) => sum + entry.amountMinor, 0);
  const budget = store.data.budgets.find((entry) => entry.month === month);
  const visible = entries
    .filter(
      (entry) =>
        (filter === 'All' || entry.category === filter) &&
        `${entry.title} ${entry.note}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((first, second) => second.date.localeCompare(first.date));
  const change = (key, value) =>
    setEditor((previous) => ({ ...previous, [key]: value }));
  function open(entry) {
    setEditor(
      entry
        ? { ...entry, amount: (entry.amountMinor / 100).toFixed(2) }
        : blank(),
    );
    setLocalError('');
  }
  async function submit(event) {
    event.preventDefault();
    const amountMinor = parseMoney(editor.amount);
    if (!amountMinor)
      return setLocalError(
        'Enter a positive amount with at most two decimal places.',
      );
    const { id, title, date, category, payment, note } = editor;
    if (
      await store.save(
        'expenses',
        { title, date, amountMinor, category, payment, note },
        id,
      )
    ) {
      setMonth(date.slice(0, 7));
      setEditor(null);
    }
  }
  async function saveBudget(event) {
    event.preventDefault();
    const limitMinor = parseMoney(budgetEditor);
    if (!limitMinor)
      return setLocalError(
        'Enter a positive budget with at most two decimal places.',
      );
    if (await store.save('budgets', { month, limitMinor }))
      setBudgetEditor(null);
  }
  function exportCsv() {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', expenseCsv(visible)], {
        type: 'text/csv;charset=utf-8;',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `lifeos-expenses-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <SpaceHeading
        eyebrow="KNOW WHERE IT GOES"
        title="Spending tracker"
        description="A simple money journal. Less guessing, more clarity."
        action="Add expense"
        onAction={() => open()}
      />
      <MoneyHub store={store} />
      <div className="space-stats">
        <Stat
          icon={Wallet}
          label="Spent this month"
          value={money(total)}
          detail={`${entries.length} expenses · INR`}
        />
        <Stat
          icon={PiggyBank}
          label={
            budget
              ? total > budget.limitMinor
                ? 'Over budget'
                : 'Budget remaining'
              : 'Monthly budget'
          }
          value={
            budget ? money(Math.abs(budget.limitMinor - total)) : 'Not set'
          }
          detail={
            budget
              ? `Budget: ${money(budget.limitMinor)}`
              : 'Choose your own limit'
          }
          tone={budget && total > budget.limitMinor ? 'warning' : ''}
        />
        <Stat
          icon={CalendarDays}
          label="Today"
          value={money(
            store.data.expenses
              .filter((entry) => entry.date === dateKey())
              .reduce((sum, entry) => sum + entry.amountMinor, 0),
          )}
          detail="One entry at a time"
        />
      </div>
      <div className="budget-strip">
        <div>
          <h2>
            {budget
              ? 'Your monthly budget'
              : 'Give your month a little structure'}
          </h2>
          {budget && (
            <div
              className={`daily-progress ${total > budget.limitMinor ? 'over' : ''}`}
            >
              <span
                style={{
                  width: `${Math.min(100, (total / budget.limitMinor) * 100)}%`,
                }}
              />
            </div>
          )}
          <p>
            {budget
              ? `${Math.round((total / budget.limitMinor) * 100)}% used`
              : 'Optional. A clear limit, chosen by you.'}
          </p>
        </div>
        <button
          className="space-secondary"
          onClick={() => {
            setLocalError('');
            setBudgetEditor(budget ? String(budget.limitMinor / 100) : '');
          }}
        >
          {budget ? 'Edit budget' : 'Set budget'}
        </button>
      </div>
      {budgetEditor !== null && (
        <Editor
          title={`Budget for ${month}`}
          saving={store.saving}
          onCancel={() => setBudgetEditor(null)}
          onSubmit={saveBudget}
          error={localError}
        >
          <Field label="Monthly budget (INR)">
            <input
              autoFocus
              required
              inputMode="decimal"
              value={budgetEditor}
              onChange={(event) => setBudgetEditor(event.target.value)}
              placeholder="10000.00"
            />
          </Field>
        </Editor>
      )}
      {editor && (
        <Editor
          title={editor.id ? 'Edit expense' : 'Add expense'}
          saving={store.saving}
          onCancel={() => setEditor(null)}
          onSubmit={submit}
          error={localError}
        >
          <div className="form-grid">
            <Field label="What was it for?">
              <input
                autoFocus
                required
                maxLength={120}
                value={editor.title}
                onChange={(event) => change('title', event.target.value)}
                placeholder="Lunch, groceries, a train ticket…"
              />
            </Field>
            <Field label="Amount (INR)">
              <input
                required
                inputMode="decimal"
                value={editor.amount}
                onChange={(event) => change('amount', event.target.value)}
                placeholder="250.00"
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                required
                value={editor.date}
                onChange={(event) => change('date', event.target.value)}
              />
            </Field>
            <Field label="Category">
              <select
                value={editor.category}
                onChange={(event) => change('category', event.target.value)}
              >
                {expenseCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>
            <Field label="Paid with">
              <select
                value={editor.payment}
                onChange={(event) => change('payment', event.target.value)}
              >
                {['UPI', 'Card', 'Wallet', 'Cash', 'Other'].map((payment) => (
                  <option key={payment}>{payment}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Note">
            <textarea
              rows={2}
              maxLength={2000}
              value={editor.note}
              onChange={(event) => change('note', event.target.value)}
            />
          </Field>
        </Editor>
      )}
      <div className="space-toolbar">
        <Field label="Month">
          <input
            type="month"
            required
            value={month}
            onChange={(event) => {
              if (event.target.value) {
                setMonth(event.target.value);
                setBudgetEditor(null);
              }
            }}
          />
        </Field>
        <input
          className="space-search"
          type="search"
          aria-label="Search expenses"
          placeholder="Find an expense…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="space-secondary"
          disabled={!visible.length}
          onClick={exportCsv}
        >
          <Download size={15} /> Export CSV
        </button>
      </div>
      <Filters
        values={['All', ...expenseCategories]}
        active={filter}
        onChange={setFilter}
        colored
      />
      <div className="spending-grid">
        <section className="record-list">
          {visible.map((entry) => {
            const CategoryIcon = categoryIcons[entry.category] ?? Wallet;
            return (
              <article
                className="expense-record"
                key={entry.id}
                data-cat={entry.category}
              >
                <span className="record-symbol" aria-hidden="true">
                  <CategoryIcon size={20} />
                </span>
                <div className="record-content">
                  <h2>{entry.title}</h2>
                  <p className="expense-facts">
                    <span className="category-chip">{entry.category}</span>
                    {displayDate(entry.date)} · {entry.payment}
                  </p>
                  {entry.note && (
                    <p className="record-description">{entry.note}</p>
                  )}
                </div>
                <strong className="expense-amount">
                  <span className="amount-sign">Spent</span>−
                  {money(entry.amountMinor)}
                </strong>
                <RecordActions
                  title={entry.title}
                  saving={store.saving}
                  onEdit={() => open(entry)}
                  onDelete={() => deleteEntry(store, 'expenses', entry)}
                />
              </article>
            );
          })}
          {!visible.length && (
            <Empty
              title="A clearer picture starts here."
              detail="Log one expense. Your month and categories will fill themselves in."
              action="Add an expense"
              onAction={() => open()}
            />
          )}
        </section>
        <aside className="category-breakdown">
          <h2>Where it went</h2>
          <p>All expenses in the selected month</p>
          {total > 0 && (
            <div className="category-stack" aria-hidden="true">
              {expenseCategories.map((category) => {
                const amount = entries
                  .filter((entry) => entry.category === category)
                  .reduce((sum, entry) => sum + entry.amountMinor, 0);
                return amount ? (
                  <span
                    key={category}
                    data-cat={category}
                    style={{ width: `${(amount / total) * 100}%` }}
                  />
                ) : null;
              })}
            </div>
          )}
          {expenseCategories.map((category) => {
            const amount = entries
              .filter((entry) => entry.category === category)
              .reduce((sum, entry) => sum + entry.amountMinor, 0);
            return (
              <div key={category} data-cat={category} className="category-row">
                <div>
                  <span>
                    <i className="category-swatch" aria-hidden="true" />
                    {category}
                  </span>
                  <strong>{money(amount)}</strong>
                </div>
                <div className="category-meter">
                  <span
                    style={{ width: `${total ? (amount / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </aside>
      </div>
    </>
  );
}
