import { useState } from 'react';
import { dateKey, expenseCategories, money, parseMoney } from './utils.js';
import { Editor, Field, Filters } from './shared.jsx';
import {
  incomingKinds,
  paymentLabels,
  peopleBalances,
  personKinds,
  splitBalances,
} from './money-utils.js';

const blankPayment = () => ({
  clientKey: crypto.randomUUID(),
  title: '',
  amount: '',
  date: dateKey(),
  kind: 'expense',
  person: '',
  recipientKey: '',
  category: 'Other',
  payment: 'UPI',
  note: '',
  remember: false,
});
export default function MoneyHub({ store }) {
  const [tab, setTab] = useState('Payments');
  const [editor, setEditor] = useState(null);
  const [tripDraft, setTripDraft] = useState(null);
  const [itemDraft, setItemDraft] = useState(null);
  const [error, setError] = useState('');
  const payments = store.data.payments ?? [];
  const pending = payments.filter((entry) => entry.status === 'pending');
  const trips = store.data.trips ?? [];
  const items = store.data.tripItems ?? [];
  const change = (key, value) =>
    setEditor((previous) => ({ ...previous, [key]: value }));
  function openPayment(entry) {
    setEditor(
      entry
        ? {
            ...blankPayment(),
            ...entry,
            amount: (entry.amountMinor / 100).toFixed(2),
          }
        : blankPayment(),
    );
    setError('');
    setTab('Payments');
  }
  function rememberRecipient(value) {
    let key = value.trim().toLowerCase();
    if (!key.includes('@')) key = key.replace(/[\s()-]/g, '');
    if (/^\d{10,15}$/.test(key)) key = `+${key}`;
    const profile = (store.data.payees ?? []).find(
      (entry) =>
        entry.recipientKey === key &&
        (!editor.direction ||
          entry.kind === 'self_transfer' ||
          (incomingKinds.includes(entry.kind) ? 'incoming' : 'outgoing') ===
            editor.direction),
    );
    setEditor((previous) => ({
      ...previous,
      recipientKey: value,
      ...(profile
        ? {
            title: profile.title,
            person: profile.person,
            category: profile.category,
            kind: profile.kind,
            remember: true,
          }
        : {}),
    }));
  }
  async function savePayment(event) {
    event.preventDefault();
    const amountMinor = parseMoney(editor.amount);
    if (!amountMinor)
      return setError(
        'Enter a positive amount with at most two decimal places.',
      );
    const {
      title,
      date,
      kind,
      person,
      recipientKey,
      category,
      payment,
      note,
      remember,
    } = editor;
    const values = {
      title,
      date,
      amountMinor,
      kind,
      person,
      recipientKey,
      category,
      payment,
      note,
      remember,
    };
    if (!editor.id) values.clientKey = editor.clientKey;
    if (
      await store.moneyCommand(
        editor.id ? `payments/${editor.id}/confirm` : 'payments',
        values,
      )
    )
      setEditor(null);
  }
  async function saveTrip(event) {
    event.preventDefault();
    const members = [
      'Me',
      ...tripDraft.members
        .split(',')
        .map((member) => member.trim())
        .filter(Boolean),
    ];
    const budgetMinor = tripDraft.budget ? parseMoney(tripDraft.budget) : 0;
    if (budgetMinor === null) return setError('Enter a valid budget.');
    if (
      await store.moneyCommand('trips', {
        title: tripDraft.title,
        members,
        budgetMinor,
        startDate: tripDraft.startDate || null,
        endDate: tripDraft.endDate || null,
      })
    )
      setTripDraft(null);
  }
  async function saveItem(event) {
    event.preventDefault();
    const amountMinor = parseMoney(itemDraft.amount);
    if (!amountMinor) return setError('Enter a valid positive amount.');
    const { clientKey, tripId, title, date, kind, payer, participants } =
      itemDraft;
    if (
      await store.moneyCommand('trip-items', {
        clientKey,
        tripId,
        title,
        date,
        kind,
        payer,
        participants,
        amountMinor,
      })
    )
      setItemDraft(null);
  }
  return (
    <section className="money-hub" aria-label="Payment review and shared money">
      <h2>Your money, with context</h2>
      <p>
        Review new payments. Keep self transfers out of spending. Track people
        and trips.
      </p>
      {pending.length > 0 && (
        <div className="payment-review-banner" role="status">
          <strong>
            {pending.length} payment{pending.length === 1 ? '' : 's'} waiting
            for you
          </strong>
          <button
            className="space-primary"
            disabled={store.saving}
            onClick={() => openPayment(pending[0])}
          >
            Review payment
          </button>
        </div>
      )}
      <Filters
        values={['Payments', 'People', 'Trips']}
        active={tab}
        onChange={setTab}
      />
      {tab === 'Payments' && (
        <>
          <button
            className="space-secondary"
            disabled={store.saving}
            onClick={() => openPayment()}
          >
            Record payment
          </button>
          {pending.map((entry) => (
            <article className="money-card" key={entry.id}>
              <strong>{entry.title}</strong>
              <p>
                {money(entry.amountMinor)} ·{' '}
                {entry.direction === 'incoming'
                  ? 'Money received'
                  : 'Money sent'}
                {entry.suggested ? ' · Remembered details' : ''}
              </p>
              <button
                disabled={store.saving}
                onClick={() => openPayment(entry)}
              >
                Check amount and details
              </button>
              <button
                disabled={store.saving}
                onClick={() =>
                  store.moneyCommand(`payments/${entry.id}/dismiss`, {})
                }
              >
                Not mine / Ignore
              </button>
            </article>
          ))}
          <h3>Recent saved payments</h3>
          {payments
            .filter((entry) => entry.status === 'confirmed')
            .slice(0, 12)
            .map((entry) => (
              <article className="money-card" key={entry.id}>
                <strong>
                  {entry.title} · {money(entry.amountMinor)}
                </strong>
                <p>
                  {paymentLabels[entry.kind]}
                  {entry.person ? ` · ${entry.person}` : ''} · {entry.date}
                </p>
              </article>
            ))}
          <p>
            Detected payments do not count as spending until you save them.
            Missing alerts can be recorded here.
          </p>
        </>
      )}
      {editor && (
        <Editor
          title={editor.id ? 'Review payment' : 'Record payment'}
          saving={store.saving}
          error={error}
          onCancel={() => setEditor(null)}
          onSubmit={savePayment}
        >
          {editor.suggested && (
            <p>
              Details remembered from this recipient. Please check them before
              saving.
            </p>
          )}
          <div className="form-grid">
            <Field label="What was this payment for?">
              <input
                required
                maxLength={120}
                value={editor.title}
                onChange={(event) => change('title', event.target.value)}
              />
            </Field>
            <Field label="Is the amount correct? (INR)">
              <input
                required
                inputMode="decimal"
                value={editor.amount}
                onChange={(event) => change('amount', event.target.value)}
              />
            </Field>
            <Field label="Payment type">
              <select
                value={editor.kind}
                onChange={(event) => change('kind', event.target.value)}
              >
                {Object.entries(paymentLabels)
                  .filter(
                    ([key]) =>
                      !editor.id ||
                      key === 'self_transfer' ||
                      (incomingKinds.includes(key)
                        ? 'incoming'
                        : 'outgoing') === editor.direction,
                  )
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Who is this with?">
              <input
                required={personKinds.includes(editor.kind)}
                maxLength={80}
                value={editor.person}
                onChange={(event) => change('person', event.target.value)}
                placeholder="A person or shop"
              />
            </Field>
            <Field label="UPI ID or phone number">
              <input
                maxLength={120}
                value={editor.recipientKey}
                onChange={(event) => rememberRecipient(event.target.value)}
                placeholder="name@bank"
              />
            </Field>
            <Field label="Category">
              <select
                value={editor.category}
                onChange={(event) => change('category', event.target.value)}
              >
                {expenseCategories.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Payment date">
              <input
                type="date"
                required
                value={editor.date}
                onChange={(event) => change('date', event.target.value)}
              />
            </Field>
            <Field label="Paid using">
              <select
                value={editor.payment}
                onChange={(event) => change('payment', event.target.value)}
              >
                {['UPI', 'Card', 'Wallet', 'Cash', 'Other'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
          </div>
          <label className="money-check">
            <input
              type="checkbox"
              checked={editor.remember}
              onChange={(event) => change('remember', event.target.checked)}
            />{' '}
            Remember purpose, person and type for this UPI ID or number
          </label>
          <p>The amount is never reused. You always choose Save.</p>
        </Editor>
      )}
      {tab === 'People' && (
        <>
          <h3>Who owes whom?</h3>
          <button
            className="space-secondary"
            disabled={store.saving}
            onClick={() => {
              openPayment();
              setEditor((previous) => ({ ...previous, kind: 'lent' }));
            }}
          >
            Record money with a person
          </button>
          {peopleBalances(payments).map((row) => (
            <article className="money-card" key={row.person}>
              <strong>{row.person}</strong>
              <p>
                Gave {money(row.gave)} · Received {money(row.received)}
              </p>
              <p>
                {row.balance > 0
                  ? `They owe you ${money(row.balance)}`
                  : row.balance < 0
                    ? `You owe them ${money(-row.balance)}`
                    : 'All settled'}
              </p>
              <button
                disabled={store.saving}
                onClick={() => {
                  openPayment();
                  setEditor((previous) => ({
                    ...previous,
                    person: row.person,
                    kind:
                      row.balance >= 0
                        ? 'repayment_received'
                        : 'repayment_paid',
                    title: 'Repayment',
                    amount: (Math.abs(row.balance) / 100).toFixed(2),
                  }));
                }}
              >
                Record repayment
              </button>
            </article>
          ))}
          <p>
            These are records, not requests to move real money. Different people
            with the same name share one balance.
          </p>
        </>
      )}
      {tab === 'Trips' && (
        <>
          <button
            className="space-secondary"
            disabled={store.saving}
            onClick={() => {
              setTripDraft({
                title: '',
                members: '',
                budget: '',
                startDate: '',
                endDate: '',
              });
              setError('');
            }}
          >
            Plan a trip
          </button>
          {trips.map((trip) => {
            const entries = items.filter((entry) => entry.tripId === trip.id);
            const spent = entries
              .filter((entry) => entry.kind === 'expense')
              .reduce((sum, entry) => sum + entry.amountMinor, 0);
            return (
              <article className="money-card" key={trip.id}>
                <h3>{trip.title}</h3>
                <p>
                  {trip.members.join(', ')}
                  {trip.startDate ? ` · ${trip.startDate}` : ''}
                  {trip.endDate ? ` to ${trip.endDate}` : ''}
                </p>
                <p>
                  Trip spent: {money(spent)}
                  {trip.budgetMinor
                    ? ` · Budget: ${money(trip.budgetMinor)} · Remaining: ${money(trip.budgetMinor - spent)}`
                    : ''}
                </p>
                {Object.entries(splitBalances(trip, items)).map(
                  ([member, balance]) => (
                    <p key={member}>
                      {member}:{' '}
                      {balance > 0
                        ? `gets back ${money(balance)}`
                        : balance < 0
                          ? `owes ${money(-balance)}`
                          : 'settled'}
                    </p>
                  ),
                )}
                <button
                  disabled={store.saving}
                  onClick={() => {
                    setError('');
                    setItemDraft({
                      clientKey: crypto.randomUUID(),
                      tripId: trip.id,
                      title: '',
                      amount: '',
                      date: dateKey(),
                      kind: 'expense',
                      payer: 'Me',
                      participants: trip.members,
                    });
                  }}
                >
                  Add shared cost
                </button>
                <button
                  disabled={store.saving}
                  onClick={() => {
                    setError('');
                    setItemDraft({
                      clientKey: crypto.randomUUID(),
                      tripId: trip.id,
                      title: 'Trip repayment',
                      amount: '',
                      date: dateKey(),
                      kind: 'settlement',
                      payer: trip.members[1],
                      participants: ['Me'],
                    });
                  }}
                >
                  Record trip repayment
                </button>
                {entries.slice(0, 8).map((entry) => (
                  <p key={entry.id}>
                    {entry.title}: {money(entry.amountMinor)} · {entry.payer}{' '}
                    paid · {entry.kind === 'expense' ? 'Split with' : 'To'}{' '}
                    {entry.participants.join(', ')}
                  </p>
                ))}
              </article>
            );
          })}
          <p>
            Trip balances belong to your account. They are not shared accounts.
            Trip costs are separate from your personal spending journal.
          </p>
        </>
      )}
      {tripDraft && (
        <Editor
          title="Plan a trip"
          saving={store.saving}
          error={error}
          onCancel={() => setTripDraft(null)}
          onSubmit={saveTrip}
        >
          <Field label="Trip name">
            <input
              required
              maxLength={80}
              value={tripDraft.title}
              onChange={(event) =>
                setTripDraft({ ...tripDraft, title: event.target.value })
              }
            />
          </Field>
          <Field label="Other people, separated by commas">
            <input
              required
              value={tripDraft.members}
              onChange={(event) =>
                setTripDraft({ ...tripDraft, members: event.target.value })
              }
              placeholder="Amit, Riya. Me is included automatically."
            />
          </Field>
          <Field label="Trip budget (INR, optional)">
            <input
              inputMode="decimal"
              value={tripDraft.budget}
              onChange={(event) =>
                setTripDraft({ ...tripDraft, budget: event.target.value })
              }
            />
          </Field>
          <div className="form-grid">
            {['startDate', 'endDate'].map((key) => (
              <Field
                key={key}
                label={key === 'startDate' ? 'Start date' : 'End date'}
              >
                <input
                  type="date"
                  value={tripDraft[key]}
                  onChange={(event) =>
                    setTripDraft({ ...tripDraft, [key]: event.target.value })
                  }
                />
              </Field>
            ))}
          </div>
        </Editor>
      )}
      {itemDraft && (
        <Editor
          title={
            itemDraft.kind === 'expense'
              ? 'Add shared cost'
              : 'Record trip repayment'
          }
          saving={store.saving}
          error={error}
          onCancel={() => setItemDraft(null)}
          onSubmit={saveItem}
        >
          <Field label="What was this for?">
            <input
              required
              maxLength={80}
              value={itemDraft.title}
              onChange={(event) =>
                setItemDraft({ ...itemDraft, title: event.target.value })
              }
            />
          </Field>
          <Field label="Total amount (INR)">
            <input
              required
              inputMode="decimal"
              value={itemDraft.amount}
              onChange={(event) =>
                setItemDraft({ ...itemDraft, amount: event.target.value })
              }
            />
          </Field>
          <Field label="Who paid?">
            <select
              value={itemDraft.payer}
              onChange={(event) =>
                setItemDraft({ ...itemDraft, payer: event.target.value })
              }
            >
              {trips
                .find((trip) => trip.id === itemDraft.tripId)
                .members.map((member) => (
                  <option key={member}>{member}</option>
                ))}
            </select>
          </Field>
          {itemDraft.kind === 'settlement' ? (
            <Field label="Who received?">
              <select
                value={itemDraft.participants[0]}
                onChange={(event) =>
                  setItemDraft({
                    ...itemDraft,
                    participants: [event.target.value],
                  })
                }
              >
                {trips
                  .find((trip) => trip.id === itemDraft.tripId)
                  .members.map((member) => (
                    <option key={member}>{member}</option>
                  ))}
              </select>
            </Field>
          ) : (
            <fieldset>
              <legend>Split equally between</legend>
              {trips
                .find((trip) => trip.id === itemDraft.tripId)
                .members.map((member) => (
                  <label className="money-check" key={member}>
                    <input
                      type="checkbox"
                      checked={itemDraft.participants.includes(member)}
                      onChange={(event) =>
                        setItemDraft({
                          ...itemDraft,
                          participants: event.target.checked
                            ? [...itemDraft.participants, member]
                            : itemDraft.participants.filter(
                                (name) => name !== member,
                              ),
                        })
                      }
                    />
                    {member}
                  </label>
                ))}
            </fieldset>
          )}
          <p>
            Whole paise are split exactly. Any extra paise go to the first
            selected people.
          </p>
        </Editor>
      )}
    </section>
  );
}
