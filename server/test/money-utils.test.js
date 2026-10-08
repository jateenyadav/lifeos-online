import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  personBalances,
  tripBalances,
  normalizeRecipient,
} from '../src/money.js';

test('person names cannot modify prototypes and pending money does not affect balances', () => {
  const balances = personBalances([
    {
      status: 'confirmed',
      person: '__proto__',
      kind: 'lent',
      amountMinor: 10000,
    },
    {
      status: 'confirmed',
      person: 'constructor',
      kind: 'borrowed',
      amountMinor: 4000,
    },
    {
      status: 'pending',
      person: '__proto__',
      kind: 'lent',
      amountMinor: 20000,
    },
  ]);
  assert.deepEqual(
    balances.map((row) => row.balanceMinor),
    [10000, -4000],
  );
  assert.equal(Object.prototype.balanceMinor, undefined);
});

test('trip shares keep the odd paise and normalize only complete recipients', () => {
  assert.deepEqual(
    tripBalances({ id: 'trip', members: ['Me', 'Ria', 'Sam'] }, [
      {
        tripId: 'trip',
        payer: 'Me',
        participants: ['Me', 'Ria', 'Sam'],
        amountMinor: 10001,
      },
    ]),
    { Me: 6667, Ria: -3334, Sam: -3333 },
  );
  assert.equal(normalizeRecipient(' Ria@UPI '), 'ria@upi');
  assert.equal(normalizeRecipient('98765 43210'), '+9876543210');
  assert.throws(() => normalizeRecipient('bank account 1234'));
});
