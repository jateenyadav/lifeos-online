import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Money from '../money/Money.jsx';
import { appFixture } from './money-fixture.js';
import { inr, parseRupees, inrShort } from '../money/format.js';
import { fitSize } from '../money/photo.js';
import { dateKey } from '../workspaces/utils.js';

vi.mock('../money/photo.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downscaleImage: vi.fn(async () => ({
    mime: 'image/jpeg',
    data: 'c21hbGw=',
    width: 1600,
    height: 1200,
  })),
}));
const { downscaleImage } = await import('../money/photo.js');

const today = dateKey();
const month = today.slice(0, 7);
const store = { data: { trips: [], tripItems: [] }, saving: false };
let fixture;

function addTxn(values) {
  const { body } = fixture.money.handle('POST', '/api/money/txns', {
    date: today,
    direction: 'debit',
    category: 'Other',
    ...values,
  });
  return Object.assign(
    fixture.money.state.txns.find((t) => t.id === body.txn.id),
    values,
  );
}
function addContact(name) {
  return fixture.money.handle('POST', '/api/money/khata/contacts', { name })
    .body.contact;
}
const show = (path = []) => render(<Money path={path} store={store} />);

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  fixture = appFixture();
  vi.stubGlobal('fetch', fixture.fetch);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('money formatting', () => {
  test('uses Indian digit groups and keeps paise exact', () => {
    expect(inr(11864000)).toBe('₹1,18,640');
    expect(inr(118640)).toBe('₹1,186.40');
    expect(inr(-5050)).toBe('−₹50.50');
    expect(inr(100, { sign: true })).toBe('+₹1');
    expect(inr(123456789012)).toBe('₹1,23,45,67,890.12');
    expect(inrShort(12500000)).toBe('₹1.3L');
  });
  test('reads amounts the way people type them', () => {
    expect(parseRupees('1,186.40')).toBe(118640);
    expect(parseRupees('₹ 1,18,640')).toBe(11864000);
    expect(parseRupees('0.5')).toBe(50);
    expect(parseRupees('-300', { allowNegative: true })).toBe(-30000);
    for (const bad of ['', '0', '1.001', 'abc', '-5', '1e3'])
      expect(parseRupees(bad)).toBeNull();
  });
  test('photos shrink to at most 1600 px on the long side', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

test('overview shows spent, income and net for the month with a budget ring', async () => {
  addTxn({
    title: 'Acme salary',
    direction: 'credit',
    amountMinor: 11864000,
    category: 'Salary',
  });
  addTxn({ title: 'Rent', amountMinor: 2500050, category: 'Rent' });
  fixture.money.handle('PUT', '/api/money/budgets', {
    month,
    category: '*',
    limitMinor: 5000000,
  });
  show();
  const hero = await screen.findByRole('region', { name: /^Summary for/ });
  expect(within(hero).getByTestId('spent')).toHaveTextContent('₹25,000.50');
  expect(within(hero).getByText('₹1,18,640')).toBeInTheDocument();
  expect(within(hero).getByText('+₹93,639.50')).toBeInTheDocument();
  expect(
    within(hero).getByRole('img', { name: '50% of the ₹50,000 budget used' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('group', { name: /Spend per day/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('group', {
      name: /Spending by category: Rent ₹25,000.50/,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Automatic capture of bank SMS works in the Android app/),
  ).toBeInTheDocument();
  expect(
    fixture.calls('GET', /\/money\/overview\?month=/).length,
  ).toBeGreaterThan(0);
});

test('transactions: filter, search, add, edit and delete', async () => {
  const interactions = userEvent.setup();
  addTxn({ title: 'Swiggy', amountMinor: 45000, category: 'Food' });
  addTxn({
    title: 'Salary',
    direction: 'credit',
    amountMinor: 9000000,
    category: 'Salary',
  });
  show(['txns']);
  const list = await screen.findByRole('region', { name: 'Payments' });
  await within(list).findByText('Swiggy');
  await interactions.click(screen.getByRole('button', { name: 'Money in' }));
  await waitFor(() =>
    expect(within(list).queryByText('Swiggy')).not.toBeInTheDocument(),
  );
  expect(within(list).getByText('Salary')).toBeInTheDocument();
  expect(
    fixture.calls('GET', /\/txns\?direction=credit/).length,
  ).toBeGreaterThan(0);
  await interactions.click(screen.getByRole('button', { name: 'All' }));
  await interactions.type(
    screen.getByRole('searchbox', { name: 'Search payments' }),
    'swig',
  );
  await waitFor(() =>
    expect(within(list).queryByText('Salary')).not.toBeInTheDocument(),
  );
  expect(fixture.calls('GET', /q=swig/).length).toBeGreaterThan(0);
  await interactions.clear(
    screen.getByRole('searchbox', { name: 'Search payments' }),
  );

  await interactions.click(screen.getByRole('button', { name: 'Add' }));
  let dialog = screen.getByRole('dialog', { name: 'Add a payment' });
  await interactions.type(
    within(dialog).getByLabelText('Amount (₹)'),
    '1,186.40',
  );
  await interactions.type(
    within(dialog).getByLabelText('What was it?'),
    'Petrol',
  );
  await interactions.selectOptions(
    within(dialog).getByLabelText('Category'),
    'Fuel',
  );
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Save' }),
  );
  await within(list).findByText('Petrol');
  expect(fixture.calls('POST', /\/money\/txns$/)[0].body).toMatchObject({
    amountMinor: 118640,
    category: 'Fuel',
    direction: 'debit',
  });

  await interactions.click(within(list).getByText('Petrol'));
  dialog = screen.getByRole('dialog', { name: 'Petrol' });
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Edit payment' }),
  );
  dialog = screen.getByRole('dialog', { name: 'Edit payment' });
  await interactions.clear(within(dialog).getByLabelText('What was it?'));
  await interactions.type(
    within(dialog).getByLabelText('What was it?'),
    'HP Petrol',
  );
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Save' }),
  );
  dialog = await screen.findByRole('dialog', { name: 'HP Petrol' });
  expect(fixture.calls('PATCH', /\/money\/txns\//)[0].body).toMatchObject({
    title: 'HP Petrol',
    amountMinor: 118640,
  });

  await interactions.click(
    within(dialog).getByRole('button', { name: 'Delete payment' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(within(list).queryByText('HP Petrol')).not.toBeInTheDocument(),
  );
  expect(fixture.calls('DELETE', /\/money\/txns\//)).toHaveLength(1);
});

test('peer answer: split a bill between 3 people creates the khata share', async () => {
  const interactions = userEvent.setup();
  addTxn({
    title: 'Rahul',
    counterparty: 'Rahul',
    isPerson: true,
    amountMinor: 100000,
  });
  show(['txns']);
  await interactions.click(
    await screen.findByText('Rahul', { selector: 'strong' }),
  );
  const dialog = screen.getByRole('dialog', { name: 'Rahul' });
  expect(
    within(dialog).getByRole('heading', { name: 'Does Rahul owe you?' }),
  ).toBeInTheDocument();
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Split the bill' }),
  );
  await interactions.click(
    within(dialog).getByRole('button', { name: 'More people' }),
  );
  expect(
    within(dialog).getByText('Others owe you ₹666.67. Your part is ₹333.33.'),
  ).toBeInTheDocument();
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Save answer' }),
  );
  await waitFor(() => expect(fixture.calls('POST', /\/peer$/)).toHaveLength(1));
  expect(fixture.calls('POST', /\/peer$/)[0].body).toEqual({
    peerTag: 'split',
    contactName: 'Rahul',
    splitPeople: 3,
  });
  expect(fixture.money.state.entries[0]).toMatchObject({
    direction: 'gave',
    amountMinor: 66667,
  });
  await within(dialog).findByText('Your part ₹333.33', { exact: false });
});

test('reimbursement: claim part of a payment, then preview what a credit pays back', async () => {
  const interactions = userEvent.setup();
  addTxn({ title: 'IndiGo', amountMinor: 742000, category: 'Travel' });
  addTxn({
    title: 'Office refund',
    direction: 'credit',
    amountMinor: 600000,
    category: 'Other income',
    date: today,
  });
  show(['txns']);
  await interactions.click(await screen.findByText('IndiGo'));
  let dialog = screen.getByRole('dialog', { name: 'IndiGo' });
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Yes, I will get it back' }),
  );
  const sheet = within(dialog).getByRole('form', { name: 'Claim sheet' });
  const amount = within(sheet).getByLabelText('How much will come back?');
  expect(amount).toHaveValue('7420');
  await interactions.clear(amount);
  await interactions.type(amount, '5,000');
  await interactions.click(
    within(sheet).getByRole('button', { name: 'Save claim' }),
  );
  await within(dialog).findByRole('heading', { name: 'Waiting to get back' });
  expect(fixture.calls('POST', /reimburse\/claim$/)[0].body).toEqual({
    amountMinor: 500000,
  });
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Close' }),
  );

  await interactions.click(await screen.findByText('Office refund'));
  dialog = screen.getByRole('dialog', { name: 'Office refund' });
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Pick what it pays back' }),
  );
  await interactions.click(
    await within(dialog).findByRole('checkbox', { name: /IndiGo/ }),
  );
  expect(
    await within(dialog).findByText('Pays back ₹5,000 · Extra ₹1,000 is yours'),
  ).toBeInTheDocument();
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Save reimbursement' }),
  );
  await waitFor(() =>
    expect(fixture.calls('POST', /reimburse\/received$/)).toHaveLength(1),
  );
  expect(
    fixture.calls('POST', /reimburse\/received$/)[0].body.claimIds,
  ).toHaveLength(1);
});

test('khata contact lists opening entries last, under the old khata heading, with running balances', async () => {
  const contact = addContact('Priya Nair');
  const add = (values) =>
    fixture.money.state.entries.push({
      id: `e-${values.note}`,
      contactId: contact.id,
      dueDate: null,
      linkedTxnId: null,
      paidForMe: false,
      isOpening: false,
      ...values,
    });
  add({
    direction: 'gave',
    amountMinor: 50000,
    date: '2026-01-10',
    note: 'Movie',
  });
  add({
    direction: 'got',
    amountMinor: 20000,
    date: '2026-02-01',
    note: 'Sent back',
  });
  add({
    direction: 'gave',
    amountMinor: 120000,
    date: '2026-06-01',
    note: 'Old trip',
    isOpening: true,
  });
  show(['khata', contact.id]);
  const heading = await screen.findByRole('heading', {
    name: 'Old khata · opening balance (before the app)',
  });
  const app = screen.getByRole('list', { name: 'Entries recorded in the app' });
  const opening = screen.getByRole('list', { name: 'Opening balance entries' });
  expect(
    within(app)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('strong').textContent),
  ).toEqual(['Sent back', 'Movie']);
  expect(within(opening).getByText('Old trip')).toBeInTheDocument();
  expect(
    app.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    heading.compareDocumentPosition(opening) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    within(app).getByText('Balance ₹1,500 due to you'),
  ).toBeInTheDocument();
  expect(
    within(opening).getByText('Balance ₹1,200 due to you'),
  ).toBeInTheDocument();
  expect(screen.getByText('Priya owes you')).toBeInTheDocument();
});

test('“You got” switch: paid for something of mine changes the text and the request', async () => {
  const interactions = userEvent.setup();
  const contact = addContact('Rohan Rao');
  show(['khata', contact.id]);
  await interactions.click(
    await screen.findByRole('button', { name: 'You got' }),
  );
  const dialog = screen.getByRole('dialog', { name: 'You got from Rohan' });
  const toggle = within(dialog).getByRole('switch', {
    name: /Rohan paid for something of mine/,
  });
  expect(toggle).not.toBeChecked();
  expect(
    within(dialog).getByText(
      'Rohan gave or sent you money. Not your spending.',
    ),
  ).toBeInTheDocument();
  await interactions.click(toggle);
  expect(
    within(dialog).getByText(/Counts as your spending/),
  ).toBeInTheDocument();
  await interactions.selectOptions(
    within(dialog).getByLabelText('Category'),
    'Food',
  );
  await interactions.type(within(dialog).getByLabelText('Amount (₹)'), '640');
  await interactions.type(within(dialog).getByLabelText('Note'), 'Lunch');
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Save' }),
  );
  await waitFor(() =>
    expect(fixture.calls('POST', /\/entries$/)).toHaveLength(1),
  );
  expect(fixture.calls('POST', /\/entries$/)[0].body).toMatchObject({
    direction: 'got',
    amountMinor: 64000,
    note: 'Lunch',
    paidForMe: true,
    category: 'Food',
  });
  expect(fixture.money.state.txns[0]).toMatchObject({
    source: 'khata',
    peerTag: 'owe_owner',
    category: 'Food',
  });
});

test('import everyone: totals-only saves one opening total per person', async () => {
  const interactions = userEvent.setup();
  show(['khata']);
  await interactions.click(
    (await screen.findAllByRole('button', { name: 'Import everyone' }))[0],
  );
  const dialog = screen.getByRole('dialog', { name: 'Import everyone' });
  await interactions.type(
    within(dialog).getByLabelText('Old khata notes'),
    'Rahul: 2,500{enter}',
  );
  // A person block with lines and a stated total that does not match
  await interactions.type(
    within(dialog).getByLabelText('Old khata notes'),
    'Sana:{enter}+1200 trip{enter}-500 back{enter}total 900',
  );
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Read the notes' }),
  );
  await within(dialog).findByDisplayValue('Sana');
  expect(
    within(dialog).getByText(/2 lines add to \+₹700 · the note says \+₹900/),
  ).toBeInTheDocument();
  await interactions.click(
    within(dialog).getByRole('switch', {
      name: /Only save each person's total/,
    }),
  );
  await interactions.click(
    within(dialog).getByRole('button', { name: /^Save \d people$/ }),
  );
  await waitFor(() =>
    expect(fixture.calls('POST', /import\/save$/)).toHaveLength(1),
  );
  const { people } = fixture.calls('POST', /import\/save$/)[0].body;
  expect(people).toEqual([
    {
      name: 'Rahul',
      choice: 'totalOnly',
      plusTheyOwe: true,
      lines: [],
      statedMinor: 250000,
    },
    {
      name: 'Sana',
      choice: 'totalOnly',
      plusTheyOwe: true,
      lines: [],
      statedMinor: 90000,
    },
  ]);
  expect(fixture.money.state.entries.every((entry) => entry.isOpening)).toBe(
    true,
  );
});

test('old khata photos are shrunk before upload', async () => {
  const interactions = userEvent.setup();
  const contact = addContact('Ravi');
  show(['khata', contact.id]);
  const input = await screen.findByLabelText('Upload photo');
  const file = new File(['x'.repeat(10)], 'page.png', { type: 'image/png' });
  await interactions.upload(input, file);
  await waitFor(() =>
    expect(fixture.calls('POST', /\/money\/photos$/)).toHaveLength(1),
  );
  expect(downscaleImage).toHaveBeenCalledWith(file, 1600);
  expect(fixture.calls('POST', /\/money\/photos$/)[0].body).toEqual({
    ownerType: 'khata_contact',
    ownerId: contact.id,
    mime: 'image/jpeg',
    data: 'c21hbGw=',
    caption: 'page.png',
  });
  expect(
    await screen.findByRole('button', { name: 'View photo 1' }),
  ).toBeInTheDocument();
});

test('credit card tile shows outstanding, available, usage, due days and the 30% hint', async () => {
  const due = new Date();
  due.setDate(due.getDate() + 5);
  const base = {
    type: 'credit_card',
    bank: 'ICICI',
    creditLimitMinor: 20000000,
    minDueMinor: 100000,
    statementDay: 18,
  };
  fixture.money.handle('POST', '/api/money/accounts', {
    ...base,
    name: 'Amazon Pay',
    last4: '9007',
    openingMinor: -5000000,
    billMinor: 4231500,
    dueDate: dateKey(due),
  });
  fixture.money.handle('POST', '/api/money/accounts', {
    ...base,
    name: 'Regalia',
    last4: '1111',
    openingMinor: -16000000,
    billMinor: 0,
  });
  show(['accounts']);
  const amazon = await screen.findByRole('article', {
    name: 'Amazon Pay credit card',
  });
  expect(within(amazon).getByText('₹50,000')).toBeInTheDocument();
  expect(within(amazon).getByText('₹1,50,000')).toBeInTheDocument();
  expect(within(amazon).getByText('₹2,00,000')).toBeInTheDocument();
  expect(within(amazon).getByText('25% used')).toBeInTheDocument();
  expect(within(amazon).getByText('₹42,315')).toBeInTheDocument();
  expect(within(amazon).getByText('5 days left')).toBeInTheDocument();
  expect(within(amazon).queryByText(/more than 30%/)).toBeNull();
  const regalia = screen.getByRole('article', { name: 'Regalia credit card' });
  expect(within(regalia).getByText('80% used')).toBeInTheDocument();
  expect(
    within(regalia).getByText(/more than 30% of the limit/),
  ).toBeInTheDocument();
  await userEvent.click(
    within(amazon).getByRole('button', { name: 'Mark paid' }),
  );
  await waitFor(() =>
    expect(fixture.calls('POST', /bill-paid$/)).toHaveLength(1),
  );
});
