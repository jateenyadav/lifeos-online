import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import MoneyHub from '../workspaces/MoneyHub.jsx';
import { peopleBalances, splitBalances } from '../workspaces/money-utils.js';

function makeStore(data = {}) {
  return {
    data: { payments: [], payees: [], trips: [], tripItems: [], ...data },
    saving: false,
    moneyCommand: vi.fn().mockResolvedValue({ id: 'saved' }),
  };
}
const pending = {
  id: 'payment',
  status: 'pending',
  title: 'New payment',
  amountMinor: 12505,
  date: '2026-10-07',
  kind: 'expense',
  direction: 'outgoing',
  person: '',
  recipientKey: '',
  category: 'Other',
  payment: 'UPI',
  note: '',
  remember: false,
};

test('reviews amount, self transfer and remembered recipient without reusing an old amount', async () => {
  const user = userEvent.setup();
  const store = makeStore({
    payments: [pending],
    payees: [
      {
        recipientKey: '+9876543210',
        title: 'Lunch',
        person: 'Ria',
        category: 'Food',
        kind: 'expense',
      },
    ],
  });
  render(<MoneyHub store={store} />);
  await user.click(screen.getByRole('button', { name: 'Review payment' }));
  await user.type(
    screen.getByLabelText('UPI ID or phone number'),
    '9876543210',
  );
  expect(screen.getByLabelText('What was this payment for?')).toHaveValue(
    'Lunch',
  );
  expect(screen.getByLabelText('Who is this with?')).toHaveValue('Ria');
  expect(screen.getByLabelText('Is the amount correct? (INR)')).toHaveValue(
    '125.05',
  );
  await user.selectOptions(
    screen.getByLabelText('Payment type'),
    'self_transfer',
  );
  await user.clear(screen.getByLabelText('Is the amount correct? (INR)'));
  await user.type(
    screen.getByLabelText('Is the amount correct? (INR)'),
    '130.50',
  );
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(store.moneyCommand).toHaveBeenCalledWith(
      'payments/payment/confirm',
      expect.objectContaining({
        amountMinor: 13050,
        kind: 'self_transfer',
        remember: true,
        person: 'Ria',
      }),
    ),
  );
});

test('incoming review never suggests an outgoing saved recipient type', async () => {
  const user = userEvent.setup();
  const store = makeStore({
    payments: [{ ...pending, direction: 'incoming', kind: 'income' }],
    payees: [
      {
        recipientKey: 'ria@upi',
        title: 'Money I lent',
        person: 'Ria',
        category: 'Other',
        kind: 'lent',
      },
    ],
  });
  render(<MoneyHub store={store} />);
  await user.click(screen.getByRole('button', { name: 'Review payment' }));
  await user.type(screen.getByLabelText('UPI ID or phone number'), 'ria@upi');
  expect(screen.getByLabelText('Payment type')).toHaveValue('income');
  expect(
    screen.queryByRole('option', { name: 'I lent money' }),
  ).not.toBeInTheDocument();
});

test('failed review keeps its form and ignores only the selected payment', async () => {
  const user = userEvent.setup();
  const store = makeStore({ payments: [pending] });
  store.moneyCommand.mockResolvedValue(null);
  render(<MoneyHub store={store} />);
  await user.click(screen.getByRole('button', { name: 'Review payment' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByLabelText('What was this payment for?')).toHaveValue(
    'New payment',
  );
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Not mine / Ignore' }));
  expect(store.moneyCommand).toHaveBeenLastCalledWith(
    'payments/payment/dismiss',
    {},
  );
});

test('people and trip balances count confirmed entries and preserve exact shares', () => {
  const payments = [
    { kind: 'lent', amountMinor: 100000, person: 'Ria', status: 'confirmed' },
    {
      kind: 'repayment_received',
      amountMinor: 40000,
      person: 'Ria',
      status: 'confirmed',
    },
    { kind: 'lent', amountMinor: 20000, person: 'Ria', status: 'confirmed' },
    { kind: 'lent', amountMinor: 50000, person: 'Ria', status: 'pending' },
  ];
  expect(peopleBalances(payments)[0].balance).toBe(80000);
  expect(
    splitBalances({ id: 'trip', members: ['Me', 'Ria', 'Sam'] }, [
      {
        tripId: 'trip',
        payer: 'Me',
        participants: ['Me', 'Ria', 'Sam'],
        amountMinor: 10001,
      },
    ]),
  ).toEqual({ Me: 6667, Ria: -3334, Sam: -3333 });
});
