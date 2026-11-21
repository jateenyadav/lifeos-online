import { useState } from 'react';
import { Plane, Plus } from 'lucide-react';
import { dateKey, parseMoney } from '../workspaces/utils.js';
import { splitBalances } from '../workspaces/money-utils.js';
import { Editor, Field } from '../workspaces/shared.jsx';
import { inr } from './format.js';
import { EmptyState } from './parts.jsx';
import Avatar from '../ui/Avatar.jsx';

/** Trips with shared costs (kept from the old spending space, same /workspaces/money endpoints). */
export default function Trips({ store }) {
  const [tripDraft, setTripDraft] = useState(null);
  const [itemDraft, setItemDraft] = useState(null);
  const [error, setError] = useState('');
  const trips = store?.data.trips ?? [];
  const items = store?.data.tripItems ?? [];
  const draftTrip =
    itemDraft && trips.find((trip) => trip.id === itemDraft.tripId);
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
  const newItem = (trip, kind) => {
    setError('');
    setItemDraft({
      clientKey: crypto.randomUUID(),
      tripId: trip.id,
      title: kind === 'expense' ? '' : 'Trip repayment',
      amount: '',
      date: dateKey(),
      kind,
      payer: kind === 'expense' ? 'Me' : trip.members[1],
      participants: kind === 'expense' ? trip.members : ['Me'],
    });
  };
  return (
    <div className="money-page">
      <div className="toolbar">
        <p className="hint">
          Trip costs are split between people. They stay separate from your own
          spending.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={store?.saving}
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
          <Plus size={16} aria-hidden="true" /> Plan a trip
        </button>
      </div>
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
              placeholder="Amit, Riya. Me is included automatically."
              onChange={(event) =>
                setTripDraft({ ...tripDraft, members: event.target.value })
              }
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
      {itemDraft && draftTrip && (
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
              {draftTrip.members.map((member) => (
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
                {draftTrip.members.map((member) => (
                  <option key={member}>{member}</option>
                ))}
              </select>
            </Field>
          ) : (
            <fieldset className="check-list">
              <legend>Split equally between</legend>
              {draftTrip.members.map((member) => (
                <label className="check-row" key={member}>
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
                  <span>{member}</span>
                </label>
              ))}
            </fieldset>
          )}
          <p className="hint">
            Whole paise are split exactly. Any extra paise go to the first
            selected people.
          </p>
        </Editor>
      )}
      {trips.length ? (
        <div className="account-grid">
          {trips.map((trip) => {
            const entries = items.filter((entry) => entry.tripId === trip.id);
            const spent = entries
              .filter((entry) => entry.kind === 'expense')
              .reduce((sum, entry) => sum + entry.amountMinor, 0);
            return (
              <article
                className="card trip-card"
                key={trip.id}
                aria-label={trip.title}
              >
                <header className="cc-head">
                  <span className="cc-chip" aria-hidden="true">
                    <Plane size={18} />
                  </span>
                  <div>
                    <h3>{trip.title}</h3>
                    <small>
                      {trip.startDate ?? ''}
                      {trip.endDate ? ` to ${trip.endDate}` : ''}
                    </small>
                  </div>
                </header>
                <strong className="mid-number">{inr(spent)}</strong>
                <p className="hint">
                  {trip.budgetMinor
                    ? `Budget ${inr(trip.budgetMinor)} · ${inr(trip.budgetMinor - spent)} left`
                    : 'Trip spent'}
                </p>
                <ul className="trip-members">
                  {Object.entries(splitBalances(trip, items)).map(
                    ([member, balance]) => (
                      <li key={member}>
                        <Avatar name={member} size={28} />
                        <span>{member}</span>
                        <b
                          className={
                            balance > 0
                              ? 'text-in'
                              : balance < 0
                                ? 'text-out'
                                : ''
                          }
                        >
                          {balance > 0
                            ? `gets back ${inr(balance)}`
                            : balance < 0
                              ? `owes ${inr(-balance)}`
                              : 'settled'}
                        </b>
                      </li>
                    ),
                  )}
                </ul>
                {entries.length > 0 && (
                  <ul className="trip-items">
                    {entries.slice(0, 8).map((entry) => (
                      <li key={entry.id}>
                        {entry.title}: {inr(entry.amountMinor)} · {entry.payer}{' '}
                        paid · {entry.kind === 'expense' ? 'Split with' : 'To'}{' '}
                        {entry.participants.join(', ')}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="row-actions wrap">
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={store.saving}
                    onClick={() => newItem(trip, 'expense')}
                  >
                    Add shared cost
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={store.saving || trip.members.length < 2}
                    onClick={() => newItem(trip, 'settlement')}
                  >
                    Record trip repayment
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        !tripDraft && (
          <EmptyState
            icon={Plane}
            title="No trips yet"
            detail="Plan a trip to split shared costs with friends."
          />
        )
      )}
    </div>
  );
}
