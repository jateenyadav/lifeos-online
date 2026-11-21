// Ported from SpendSense test/unit/khata_import_test.dart and khata_bulk_import_test.dart.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseKhataText,
  signedMinor,
  toMinor,
  totalMinor,
} from '../src/money/text-import.js';
import {
  finalMinor,
  fixMinor,
  linesMinor,
  matches,
  nameKey,
  openingEntries,
  owedToMe,
  parseBulkKhata,
} from '../src/money/bulk-import.js';
import { userNotes } from './support/user-notes.js';

const rupees = (lines) => lines.map((line) => signedMinor(line) / 100);

test('text import: name heading, plus and minus, notes in brackets, dates', () => {
  const lines = parseKhataText(
    'Maa - 68000 + 17000( maa) -20000(rakesh mama) - 5000 varun 7 oct',
    { now: '2026-11-18' },
  );
  assert.deepEqual(rupees(lines), [68000, 17000, -20000, -5000]);
  assert.equal(lines[2].note, 'rakesh mama');
  assert.equal(lines[3].note, 'varun');
  assert.equal(lines[3].date, '2026-10-07');
  assert.equal(totalMinor(lines) / 100, 60000);
});

test('text import: k / lac / lakh, glued words, dates are not amounts', () => {
  const lines = parseKhataText(
    '50000sent(amex card 10 march) + 50k sbi debit card + 1lac recived 29 oct + 1.5 lakh + 5100(canteen 3sep)',
    { now: '2026-11-18' },
  );
  assert.deepEqual(
    lines.map((line) => line.amountMinor / 100),
    [50000, 50000, 100000, 150000, 5100],
  );
  assert.equal(lines[0].date, '2026-03-10');
  assert.equal(lines[0].note, 'sent amex card');
  assert.equal(lines[4].date, '2026-09-03');
});

test('text import: bracket of sums is one amount; a future date means last year', () => {
  const lines = parseKhataText('100000−(47826+40000) + 3526 sbi (9 dec)', {
    now: '2026-11-18',
  });
  assert.deepEqual(rupees(lines), [100000, -87826, 3526]);
  assert.equal(lines[2].date, '2025-12-09');
});

test('text import: text without a number becomes a note on the line before', () => {
  const lines = parseKhataText(
    '- 50000(neha 5 oct) {minus from dada ji} - 11300 (maruti 12 nov)',
    { now: '2026-11-18' },
  );
  assert.equal(lines.length, 2);
  assert.match(lines[0].note, /minus from dada ji/);
  assert.equal(lines[1].note, 'maruti');
});

test('text import: a forgotten closing bracket does not swallow the next lines', () => {
  const lines = parseKhataText(
    '- 5100 canteen (10k got cancelled for crackers(4850 and sweets 4500 ) -11300 (hyundai 12 nov)',
    { now: '2026-11-18' },
  );
  assert.deepEqual(rupees(lines), [-5100, -11300]);
});

test('text import: Indian spacing and commas, hyphen inside a word', () => {
  const now = '2026-11-18';
  assert.equal(parseKhataText('1 34250', { now })[0].amountMinor / 100, 134250);
  assert.equal(
    parseKhataText('1,34,250 rent', { now })[0].amountMinor / 100,
    134250,
  );
  assert.equal(
    parseKhataText('e-mail refund 500', { now })[0].note,
    'e-mail refund',
  );
  assert.equal(toMinor('1.5 lakh'), 15000000);
  assert.equal(toMinor('2 lac'), 20000000);
  assert.equal(toMinor('abc'), null);
});

test('text import: each new line is a new entry', () => {
  const lines = parseKhataText('Lent 2000 for bike 3 jan\nGot back 500 4 feb', {
    now: '2026-11-18',
  });
  assert.equal(lines.length, 2);
  assert.equal(lines[1].note, 'Got back');
});

test("bulk import: the user's notes give three people with their own totals", () => {
  const people = parseBulkKhata(userNotes, { now: '2026-11-20' });
  assert.deepEqual(
    people.map((person) => person.name),
    ['Dadaji', 'Maa', 'Rohan'],
  );
  assert.equal(people[2].tag, 'pune');

  const [dadaji, maa, rohan] = people;
  assert.equal(dadaji.lines.length, 15);
  assert.equal(dadaji.lines[0].amountMinor, 13425000);
  assert.equal(linesMinor(dadaji), 12096000);
  assert.equal(dadaji.statedMinor, 8870000);
  assert.equal(matches(dadaji), false);
  assert.equal(dadaji.choice, 'linesAndFix');
  assert.equal(fixMinor(dadaji), 8870000 - 12096000);
  assert.equal(finalMinor(dadaji), 8870000);

  assert.equal(maa.lines.length, 8);
  assert.equal(linesMinor(maa), 0);
  assert.equal(maa.statedMinor, 0);
  assert.equal(matches(maa), true);
  assert.equal(maa.choice, 'lines');

  assert.equal(rohan.lines.length, 20);
  assert.equal(rohan.statedMinor, 0);
  assert.equal(rohan.choice, 'linesAndFix');
  assert.equal(finalMinor(rohan), 0);
});

test('bulk import: people on back-to-back lines, colon style, no pending section', () => {
  const people = parseBulkKhata(
    'Ramesh: 5000 + 200 (tea 3 oct)\nSita - 1000 - 400\nAmit 2500',
    { now: '2026-11-20' },
  );
  assert.deepEqual(
    people.map((person) => `${person.name}=${linesMinor(person) / 100}`),
    ['Ramesh=5200', 'Sita=600', 'Amit=2500'],
  );
  assert.ok(
    people.every(
      (person) => person.statedMinor === null && person.choice === 'lines',
    ),
  );
  assert.equal(people[0].lines[1].date, '2026-10-03');
});

test('bulk import: a line starting with + or a number continues the person above', () => {
  const people = parseBulkKhata(
    'Raju - 5000\n+ 2000 (petrol)\n- 1000\n\nGeeta - 300',
    { now: '2026-11-20' },
  );
  assert.deepEqual(
    people.map((person) => `${person.name}=${linesMinor(person) / 100}`),
    ['Raju=6000', 'Geeta=300'],
  );
  assert.equal(people[0].lines.length, 3);
});

test('bulk import: someone only in the pending list gets just that total', () => {
  const people = parseBulkKhata(
    'Raju - 5000\n\ntotal\nRaju - 5000\nChotu - 750',
    { now: '2026-11-20' },
  );
  assert.deepEqual(
    people.map((person) => person.name),
    ['Raju', 'Chotu'],
  );
  assert.equal(matches(people[0]), true);
  assert.equal(people[1].lines.length, 0);
  assert.equal(people[1].statedMinor, 75000);
  assert.equal(people[1].choice, 'totalOnly');
});

test('bulk import: owedToMe follows the "+ means" choice; name keys ignore case and spaces', () => {
  const [person] = parseBulkKhata('Dada ji - 1000', { now: '2026-11-20' });
  assert.equal(person.plusTheyOwe, false);
  assert.equal(owedToMe(person, 100000), -100000);
  person.plusTheyOwe = true;
  assert.equal(owedToMe(person, 100000), 100000);
  assert.equal(nameKey('Dada ji'), nameKey('DADAJI'));
});

test('bulk import: nothing useful gives nobody', () => {
  assert.deepEqual(parseBulkKhata('', { now: '2026-11-20' }), []);
  assert.deepEqual(parseBulkKhata('hello\n\n', { now: '2026-11-20' }), []);
});

test('opening entries: I owe Dadaji 88,700 with every line kept; Maa and Rohan settled', () => {
  const people = parseBulkKhata(userNotes, { now: '2026-11-20' });
  const entries = people.map((person) => openingEntries(person, '2026-11-20'));
  // Dadaji 15 + correction, Maa 8, Rohan 20 + correction.
  assert.deepEqual(
    entries.map((list) => list.length),
    [16, 8, 21],
  );
  const balance = (list) =>
    list.reduce(
      (sum, entry) =>
        sum +
        (entry.direction === 'gave' ? entry.amountMinor : -entry.amountMinor),
      0,
    );
  assert.equal(balance(entries[0]), -8870000);
  assert.equal(balance(entries[1]), 0);
  assert.equal(balance(entries[2]), 0);
  assert.ok(
    entries[0].some(
      (entry) => entry.note === 'Old khata · correction to match my total',
    ),
  );
  assert.ok(entries[0].some((entry) => entry.note === 'Old khata · maruti'));
  // Undated lines take the date of the line before them.
  assert.ok(
    entries[0].every((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date)),
  );
});

test('opening entries: only total, skip, and "+ means they owe" for one', () => {
  const people = parseBulkKhata('Dadaji - 5000 + 1000\nMaa - 300\nRaju - 700', {
    now: '2026-11-20',
  });
  people[0].choice = 'totalOnly';
  people[0].plusTheyOwe = true;
  people[1].choice = 'skip';
  assert.deepEqual(openingEntries(people[0], '2026-11-20'), [
    {
      direction: 'gave',
      amountMinor: 600000,
      date: '2026-11-20',
      note: 'Old khata balance',
    },
  ]);
  assert.deepEqual(openingEntries(people[1], '2026-11-20'), []);
  assert.equal(openingEntries(people[2], '2026-11-20')[0].direction, 'got');
});
