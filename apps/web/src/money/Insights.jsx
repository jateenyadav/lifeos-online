import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { query, useAction, useLoad } from './client.js';
import { LineChart, Meter } from './charts.jsx';
import {
  expenseCategories,
  inr,
  lastDay,
  monthKey,
  parseRupees,
  shortMonth,
  toInput,
} from './format.js';
import {
  AmountInput,
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  MonthPicker,
} from './parts.jsx';
import { listOf } from './TxnDrawer.jsx';

function BudgetRow({ month, category, spent, budget }) {
  const [draft, setDraft] = useState(null);
  const { run, busy, error, setError } = useAction();
  const id = `budget-${category.replace(/\W/g, '')}`;
  if (draft !== null)
    return (
      <li className="budget-row editing">
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const limitMinor = parseRupees(draft);
            if (!limitMinor) return setError('Enter an amount.');
            if (
              await run('/budgets', {
                method: 'PUT',
                body: { month, category, limitMinor },
              })
            )
              setDraft(null);
          }}
        >
          <AmountInput
            id={id}
            label={`${category} budget`}
            value={draft}
            onChange={setDraft}
            autoFocus
          />
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => setDraft(null)}
          >
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" disabled={busy}>
            Save
          </button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </li>
    );
  return (
    <li className="budget-row">
      <div className="budget-row-top">
        <strong>{category}</strong>
        <span>
          {inr(spent)}
          {budget ? <small> of {inr(budget.limitMinor)}</small> : null}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={`${budget ? 'Edit' : 'Set'} ${category} budget`}
          onClick={() => setDraft(budget ? toInput(budget.limitMinor) : '')}
        >
          <Pencil size={14} />
        </button>
        {budget?.id && (
          <button
            type="button"
            className="icon-button danger"
            aria-label={`Remove ${category} budget`}
            disabled={busy}
            onClick={() => run(`/budgets/${budget.id}`, { method: 'DELETE' })}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {budget ? (
        <Meter
          value={spent}
          max={budget.limitMinor}
          label={`${category}: ${inr(spent)} of ${inr(budget.limitMinor)}`}
        />
      ) : (
        <span className="hint">No budget</span>
      )}
    </li>
  );
}

export default function Insights() {
  const [month, setMonth] = useState(monthKey());
  const { data, error, loading, reload } = useLoad(`/overview?month=${month}`);
  const { data: budgetData } = useLoad(`/budgets?month=${month}`);
  const { data: accountData } = useLoad('/accounts');
  const { data: txnData } = useLoad(
    `/txns${query({ from: `${month}-01`, to: lastDay(month), direction: 'debit', status: 'cleared', limit: 500 })}`,
  );
  const budgets = listOf(budgetData);
  const accounts = listOf(accountData);
  const perAccount = new Map();
  for (const txn of listOf(txnData)) {
    if (txn.isTransfer) continue;
    perAccount.set(
      txn.accountId ?? '',
      (perAccount.get(txn.accountId ?? '') ?? 0) +
        (txn.ownMinor ?? txn.amountMinor),
    );
  }
  const accountRows = [...perAccount].sort((a, b) => b[1] - a[1]);
  const categoryRows = expenseCategories
    .map((category) => ({
      category,
      spent:
        data?.byCategory.find((row) => row.category === category)?.minor ?? 0,
      budget: budgets.find((row) => row.category === category),
    }))
    .filter((row) => row.spent > 0 || row.budget)
    .sort((a, b) => b.spent - a.spent);
  const unused = expenseCategories.filter(
    (category) => !categoryRows.some((row) => row.category === category),
  );
  const savings = (data?.trend ?? []).reduce(
    (list, row) => [
      ...list,
      (list.at(-1) ?? 0) + row.incomeMinor - row.spentMinor,
    ],
    [],
  );
  return (
    <div className="money-page">
      <div className="toolbar">
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <ErrorNote message={error} onRetry={reload} />
      {loading && !data && <Loading rows={5} label="Loading insights…" />}
      {data && (
        <div className="money-grid">
          <Card title="Cash flow, 12 months" className="span-2">
            <LineChart
              label="Money in and out per month"
              labels={data.trend.map((row) => shortMonth(row.month))}
              area={false}
              series={[
                {
                  name: 'In',
                  color: 'var(--chart-1)',
                  values: data.trend.map((row) => row.incomeMinor),
                },
                {
                  name: 'Out',
                  color: 'var(--chart-3)',
                  values: data.trend.map((row) => row.spentMinor),
                },
              ]}
            />
          </Card>
          <Card title="Net worth">
            <strong className="big-number">{inr(data.netWorthMinor)}</strong>
            <p className="hint">
              Your accounts minus your own card dues. Someone else’s card is
              left out.
            </p>
            <LineChart
              label="Money saved over 12 months (income minus spending, added up)"
              labels={data.trend.map((row) => shortMonth(row.month))}
              height={110}
              series={[
                { name: 'Saved', color: 'var(--chart-5)', values: savings },
              ]}
            />
            <p className="hint">
              Line: income minus spending, added up month by month.
            </p>
          </Card>
          <Card title="Categories and budgets" className="span-2">
            {categoryRows.length ? (
              <ul className="budget-list">
                {categoryRows.map((row) => (
                  <BudgetRow
                    key={`${month}-${row.category}`}
                    month={month}
                    {...row}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState title="No spending in this month" />
            )}
            {unused.length > 0 && (
              <details className="more-budgets">
                <summary>Set a budget for another category</summary>
                <ul className="budget-list">
                  {unused.map((category) => (
                    <BudgetRow
                      key={`${month}-${category}`}
                      month={month}
                      category={category}
                      spent={0}
                    />
                  ))}
                </ul>
              </details>
            )}
          </Card>
          <Card title="By account">
            {accountRows.length ? (
              <ol className="rank-list">
                {accountRows.map(([accountId, minor]) => (
                  <li key={accountId || 'none'}>
                    <div>
                      <strong>
                        {accounts.find((account) => account.id === accountId)
                          ?.name ?? 'No account'}
                      </strong>
                    </div>
                    <b>{inr(minor)}</b>
                    <Meter
                      value={minor}
                      max={accountRows[0][1]}
                      tone="info"
                      label="Share of spending"
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="Nothing spent" />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
