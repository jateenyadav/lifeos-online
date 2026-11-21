import { useState } from 'react';
import {
  CircleCheck,
  CircleAlert,
  ImagePlus,
  Repeat2,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { Sheet, Switch } from '../ui/Sheet.jsx';
import Avatar from '../ui/Avatar.jsx';
import { useAction } from './client.js';
import { dayLabel, inr, parseRupees, toInput } from './format.js';
import { Field } from './parts.jsx';
import { PhotoUploader } from './TxnDrawer.jsx';

const signed = (minor) => inr(minor, { sign: true });

function LinePreview({ lines, onChange }) {
  return (
    <ul className="import-lines">
      {lines.map((line, index) => (
        <li key={index}>
          <span className="txn-main">
            <strong>{line.note || 'Old entry'}</strong>
            {line.date && <small>{dayLabel(line.date)}</small>}
          </span>
          <b className={line.signedMinor >= 0 ? 'text-in' : 'text-out'}>
            {signed(line.signedMinor)}
          </b>
          <button
            type="button"
            className="icon-button"
            aria-label={`Flip sign of ${line.note || 'line'}`}
            onClick={() =>
              onChange(
                lines.map((row, at) =>
                  at === index
                    ? { ...row, signedMinor: -row.signedMinor }
                    : row,
                ),
              )
            }
          >
            <Repeat2 size={15} />
          </button>
          <button
            type="button"
            className="icon-button danger"
            aria-label={`Remove ${line.note || 'line'}`}
            onClick={() => onChange(lines.filter((_, at) => at !== index))}
          >
            <Trash2 size={15} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Paste one person's old notes → preview lines → save lines or the total (all isOpening). */
export function PersonImport({ contact, onClose }) {
  const [text, setText] = useState('');
  const [lines, setLines] = useState(null);
  const [choice, setChoice] = useState('lines');
  const [plusTheyOwe, setPlusTheyOwe] = useState(true);
  const { run, busy, error, setError } = useAction();
  const name = contact.name.split(' ')[0];
  const total = (lines ?? []).reduce((sum, line) => sum + line.signedMinor, 0);
  async function parse(event) {
    event.preventDefault();
    const result = await run(
      '/khata/import/parse',
      { method: 'POST', body: { text, mode: 'person' } },
      { keep: true },
    );
    if (!result) return;
    if (!result.lines?.length)
      return setError(
        'No amounts found. Put one amount on each line, like “500 dinner”.',
      );
    setLines(result.lines);
  }
  async function save() {
    const result = await run('/khata/import/save', {
      method: 'POST',
      body: {
        people: [
          {
            name: contact.name,
            choice: choice === 'total' ? 'totalOnly' : 'lines',
            plusTheyOwe,
            lines,
            statedMinor: total,
          },
        ],
      },
    });
    if (result) onClose();
  }
  return (
    <Sheet
      title={`Add old khata for ${name}`}
      onClose={onClose}
      busy={busy}
      wide
    >
      {!lines ? (
        <form className="form" onSubmit={parse}>
          <p className="hint">
            Paste the notes you kept before the app. One amount per line. “k”
            and “lakh” work, and so do dates like “3 sep”.
          </p>
          <Field label="Old notes">
            <textarea
              rows={8}
              autoFocus
              value={text}
              placeholder={'+500 dinner 3 sep\n-200 sent back\n1.5k rent share'}
              onChange={(event) => setText(event.target.value)}
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
            <button className="btn btn-primary" disabled={busy || !text.trim()}>
              {busy ? 'Reading…' : 'Read the notes'}
            </button>
          </div>
        </form>
      ) : (
        <div className="form">
          <LinePreview lines={lines} onChange={setLines} />
          <p className="import-total">
            Total <b>{signed(total)}</b>
          </p>
          <Switch
            checked={plusTheyOwe}
            onChange={setPlusTheyOwe}
            label={`“+” means ${name} owes me`}
            hint={
              plusTheyOwe
                ? `+ lines become “You gave”.`
                : `+ lines become “You got”.`
            }
          />
          <fieldset className="radio-group">
            <legend>What to save</legend>
            <label>
              <input
                type="radio"
                name="person-choice"
                checked={choice === 'lines'}
                onChange={() => setChoice('lines')}
              />{' '}
              Each line ({lines.length})
            </label>
            <label>
              <input
                type="radio"
                name="person-choice"
                checked={choice === 'total'}
                onChange={() => setChoice('total')}
              />{' '}
              Only the total
            </label>
          </fieldset>
          <p className="hint">
            Saved under “Old khata · opening balance”, below everything recorded
            in the app.
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setLines(null)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !lines.length}
              onClick={save}
            >
              {busy ? 'Saving…' : 'Save old khata'}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

const choiceLabels = {
  lines: 'Save each line',
  linesAndFix: 'Save lines + fix to the noted total',
  totalOnly: 'Save only the total',
  skip: 'Skip this person',
};

/** "Import everyone": paste notes (or keep screenshots as photos and type totals) → preview per person → save. */
export function BulkImport({ onClose }) {
  const [text, setText] = useState('');
  const [photoIds, setPhotoIds] = useState([]);
  const [people, setPeople] = useState(null);
  const [totalsOnly, setTotalsOnly] = useState(false);
  const { run, busy, error, setError } = useAction();
  const update = (index, patch) =>
    setPeople((list) =>
      list.map((row, at) => (at === index ? { ...row, ...patch } : row)),
    );
  async function parse(event) {
    event.preventDefault();
    if (!text.trim()) {
      setPeople([]);
      return;
    }
    const result = await run(
      '/khata/import/parse',
      { method: 'POST', body: { text, mode: 'bulk' } },
      { keep: true },
    );
    if (!result) return;
    setPeople(
      (result.people ?? []).map((person) => ({
        ...person,
        plusTheyOwe: true,
        total: toInput(person.statedMinor ?? person.linesMinor),
      })),
    );
  }
  async function save() {
    const body = [];
    for (const person of people) {
      const choice = totalsOnly
        ? person.choice === 'skip'
          ? 'skip'
          : 'totalOnly'
        : person.choice;
      if (choice === 'skip') continue;
      let statedMinor = person.statedMinor ?? null;
      if (choice === 'totalOnly') {
        statedMinor = parseRupees(person.total, { allowNegative: true });
        if (statedMinor == null)
          return setError(
            `Enter a total for ${person.name || 'each person'}, like 1,200 or -300.`,
          );
      }
      if (!person.name.trim()) return setError('Every person needs a name.');
      body.push({
        name: person.name.trim(),
        choice,
        plusTheyOwe: person.plusTheyOwe,
        lines: choice === 'totalOnly' ? [] : person.lines,
        statedMinor,
      });
    }
    if (!body.length) return setError('Nothing to save yet.');
    if (
      await run('/khata/import/save', {
        method: 'POST',
        body: { people: body, ...(photoIds.length ? { photoIds } : {}) },
      })
    )
      onClose();
  }
  return (
    <Sheet title="Import everyone" onClose={onClose} busy={busy} wide>
      {!people ? (
        <form className="form" onSubmit={parse}>
          <p className="hint">
            Paste your old khata for many people at once. Start each person with
            their name and a colon.
          </p>
          <Field label="Old khata notes">
            <textarea
              rows={9}
              autoFocus
              value={text}
              placeholder={
                'Rahul: 2,500\nPriya (college)\n+1200 trip 3 sep\n-500 sent back\ntotal 700'
              }
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
          <div className="switch-card">
            <p className="hint">
              <ImagePlus size={15} aria-hidden="true" /> Screenshots: the web
              app can’t read them reliably, so they are kept as photos next to
              each person. Type or paste the totals above.
            </p>
            <PhotoUploader
              ownerType="khata_contact"
              ownerId={null}
              label="Add screenshots"
              onUploaded={(id) => setPhotoIds((list) => [...list, id])}
            />
            {photoIds.length > 0 && (
              <p className="hint">
                {photoIds.length} screenshot{photoIds.length === 1 ? '' : 's'}{' '}
                kept as photos.
              </p>
            )}
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || (!text.trim() && !photoIds.length)}
            >
              {busy
                ? 'Reading…'
                : text.trim()
                  ? 'Read the notes'
                  : 'Type totals by hand'}
            </button>
          </div>
        </form>
      ) : (
        <div className="form">
          <Switch
            checked={totalsOnly}
            onChange={setTotalsOnly}
            label="Only save each person's total"
            hint={
              totalsOnly
                ? 'One opening entry per person.'
                : 'Each line becomes its own opening entry.'
            }
          />
          <ul className="import-people">
            {people.map((person, index) => {
              const matches =
                person.statedMinor == null ||
                person.statedMinor === person.linesMinor;
              const choice = totalsOnly
                ? person.choice === 'skip'
                  ? 'skip'
                  : 'totalOnly'
                : person.choice;
              return (
                <li
                  key={index}
                  className="card import-person"
                  data-skip={choice === 'skip'}
                >
                  <div className="import-person-head">
                    <Avatar name={person.name || '?'} size={36} />
                    <Field label="Name">
                      <input
                        value={person.name}
                        maxLength={80}
                        onChange={(event) =>
                          update(index, { name: event.target.value })
                        }
                      />
                    </Field>
                    {person.tag && (
                      <span className="badge badge-quiet">{person.tag}</span>
                    )}
                  </div>
                  {person.lines?.length > 0 && (
                    <p
                      className={`check-line ${matches ? 'is-ok' : 'is-warn'}`}
                    >
                      {matches ? (
                        <CircleCheck size={15} aria-hidden="true" />
                      ) : (
                        <CircleAlert size={15} aria-hidden="true" />
                      )}
                      {person.lines.length} line
                      {person.lines.length === 1 ? '' : 's'} add to{' '}
                      {signed(person.linesMinor)}
                      {person.statedMinor != null &&
                        (matches
                          ? ' · matches the noted total'
                          : ` · the note says ${signed(person.statedMinor)}`)}
                    </p>
                  )}
                  <div className="form-grid">
                    {!totalsOnly && (
                      <Field label="Save">
                        <select
                          value={person.choice}
                          onChange={(event) =>
                            update(index, { choice: event.target.value })
                          }
                        >
                          {Object.entries(choiceLabels)
                            .filter(
                              ([value]) =>
                                value === 'totalOnly' ||
                                value === 'skip' ||
                                person.lines?.length,
                            )
                            .filter(
                              ([value]) =>
                                value !== 'linesAndFix' ||
                                person.statedMinor != null,
                            )
                            .map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                        </select>
                      </Field>
                    )}
                    {choice === 'totalOnly' && (
                      <Field
                        label={`Total for ${person.name || 'this person'} (₹)`}
                      >
                        <input
                          inputMode="decimal"
                          value={person.total}
                          onChange={(event) =>
                            update(index, { total: event.target.value })
                          }
                        />
                      </Field>
                    )}
                  </div>
                  <Switch
                    checked={person.plusTheyOwe}
                    onChange={(value) => update(index, { plusTheyOwe: value })}
                    label="“+” means they owe me"
                  />
                  {totalsOnly && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        update(index, {
                          choice: person.choice === 'skip' ? 'lines' : 'skip',
                        })
                      }
                    >
                      {person.choice === 'skip'
                        ? 'Include this person'
                        : 'Skip this person'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() =>
              setPeople((list) => [
                ...list,
                {
                  name: '',
                  tag: '',
                  lines: [],
                  linesMinor: 0,
                  statedMinor: null,
                  choice: 'totalOnly',
                  plusTheyOwe: true,
                  total: '',
                },
              ])
            }
          >
            <UserPlus size={15} aria-hidden="true" /> Add a person by hand
          </button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setPeople(null)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !people.length}
              onClick={save}
            >
              {busy
                ? 'Saving…'
                : `Save ${people.filter((p) => p.choice !== 'skip').length} people`}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
