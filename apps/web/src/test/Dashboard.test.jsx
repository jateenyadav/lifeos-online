import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../Dashboard.jsx';
import { appFixture, json } from './money-fixture.js';
import { dateKey } from '../workspaces/utils.js';

const user = {
  id: 'user-1',
  name: 'LifeOS Learner',
  email: 'demo@lifeos.local',
};
let fixture;
beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('scrollTo', vi.fn());
  fixture = appFixture();
  vi.stubGlobal('fetch', fixture.fetch);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const renderDashboard = (overrides = {}) =>
  render(
    <Dashboard
      user={user}
      busy={false}
      error=""
      onLogout={vi.fn()}
      {...overrides}
    />,
  );
async function openSpace(interactions, title) {
  await interactions.click(
    screen.getByRole('link', { name: title, exact: true }),
  );
  await screen.findByRole('heading', { name: title, exact: true });
}

test('loads Today and navigates to the spaces with real addresses', async () => {
  const interactions = userEvent.setup();
  renderDashboard();
  await screen.findByRole('heading', { name: 'Hello, LifeOS.' });
  const nav = screen.getByRole('navigation', { name: 'Workspaces' });
  await waitFor(() =>
    expect(fixture.fetch).toHaveBeenCalledWith(
      '/api/ai/status',
      expect.anything(),
    ),
  );
  expect(within(nav).getAllByRole('link')).toHaveLength(5);
  expect(
    screen.queryByRole('link', { name: 'Personal AI' }),
  ).not.toBeInTheDocument();
  for (const [title, hash, action] of [
    ['Notes & reminders', '#notes', 'New note'],
    ['Workout tracker', '#workouts', 'Log workout'],
    ['Daily routines', '#routines', 'Add routine'],
    ['Money', '#money', 'Add payment'],
  ]) {
    await openSpace(interactions, title);
    expect(window.location.hash).toBe(hash);
    expect(screen.getByRole('link', { name: title })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('button', { name: action, exact: true }),
    ).toBeEnabled();
  }
});

test('old #spending addresses open Money', async () => {
  window.location.hash = '#spending';
  renderDashboard();
  await screen.findByRole('heading', { name: 'Money', exact: true });
  expect(window.location.hash).toBe('#money');
});

test('Personal AI, Tell LifeOS and the Today AI link appear only when LifeOS AI is available', async () => {
  fixture = appFixture({ ai: true });
  vi.stubGlobal('fetch', fixture.fetch);
  renderDashboard();
  await screen.findByRole('heading', { name: 'Hello, LifeOS.' });
  const aiLink = await screen.findByRole('link', { name: 'Personal AI' });
  expect(aiLink).toHaveAttribute('href', '#ai');
  expect(screen.getByRole('link', { name: /Just say it/ })).toBeInTheDocument();
  await userEvent.click(aiLink);
  expect(
    await screen.findByRole('heading', { name: 'Tell LifeOS' }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('AI connection')).not.toBeInTheDocument();
});

test('AI stays hidden when the server says LifeOS AI is off, even at #ai', async () => {
  window.location.hash = '#ai';
  renderDashboard();
  await screen.findByRole('heading', { name: 'Hello, LifeOS.' });
  await waitFor(() => expect(window.location.hash).toBe('#today'));
  expect(screen.queryByRole('link', { name: 'Personal AI' })).toBeNull();
  expect(screen.queryByRole('link', { name: /Just say it/ })).toBeNull();
  expect(screen.queryByText('Tell LifeOS')).toBeNull();
});

test('the theme toggle cycles system, light and dark and remembers the choice', async () => {
  const interactions = userEvent.setup();
  renderDashboard();
  await screen.findByRole('heading', { name: 'Hello, LifeOS.' });
  const toggle = screen.getByRole('button', { name: /^Theme: System/ });
  expect(document.documentElement.dataset.theme).toBe('light');
  await interactions.click(toggle);
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(JSON.parse(localStorage.getItem('lifeos.prefs')).theme).toBe('light');
  await interactions.click(
    screen.getByRole('button', { name: /^Theme: Light/ }),
  );
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(JSON.parse(localStorage.getItem('lifeos.prefs')).theme).toBe('dark');
  await interactions.click(
    screen.getByRole('button', { name: /^Theme: Dark/ }),
  );
  expect(JSON.parse(localStorage.getItem('lifeos.prefs')).theme).toBe('system');
});

test('the theme choice survives blocked storage', async () => {
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const interactions = userEvent.setup();
  renderDashboard();
  await screen.findByRole('heading', { name: 'Hello, LifeOS.' });
  await interactions.click(
    screen.getByRole('button', { name: /^Theme: System/ }),
  );
  await interactions.click(
    screen.getByRole('button', { name: /^Theme: Light/ }),
  );
  expect(document.documentElement.dataset.theme).toBe('dark');
});

test('Settings can turn Lumi off', async () => {
  const interactions = userEvent.setup();
  renderDashboard();
  await screen.findByRole('heading', { name: 'Hello, LifeOS.' });
  expect(screen.getByRole('img', { name: /Lumi/ })).toBeInTheDocument();
  await interactions.click(
    screen.getByRole('button', { name: 'Account menu' }),
  );
  await interactions.click(screen.getByRole('button', { name: 'Settings' }));
  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  await interactions.click(
    within(dialog).getByRole('switch', { name: /Show Lumi/ }),
  );
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Close' }),
  );
  expect(screen.queryByRole('img', { name: /^Lumi/ })).toBeNull();
});

test('creates, edits, pins, searches, archives, restores, and deletes a note', async () => {
  const interactions = userEvent.setup();
  renderDashboard();
  await screen.findByRole('heading', { name: 'Hello, LifeOS.' });
  await openSpace(interactions, 'Notes & reminders');
  await interactions.click(
    screen.getByRole('button', { name: 'New note', exact: true }),
  );
  await interactions.type(screen.getByLabelText('Title'), 'My real note');
  await interactions.type(screen.getByLabelText('Details'), 'A useful thought');
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await screen.findByRole('heading', { name: 'My real note' });
  expect(fixture.spaces.data.notes[0].body).toBe('A useful thought');
  await interactions.click(
    screen.getByRole('button', { name: 'Pin My real note' }),
  );
  await waitFor(() => expect(fixture.spaces.data.notes[0].pinned).toBe(true));
  await interactions.click(
    screen.getByRole('button', { name: 'Edit My real note' }),
  );
  await interactions.clear(screen.getByLabelText('Title'));
  await interactions.type(screen.getByLabelText('Title'), 'Updated note');
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await screen.findByRole('heading', { name: 'Updated note' });
  await interactions.type(
    screen.getByRole('searchbox', { name: 'Search notes' }),
    'no match',
  );
  expect(
    screen.queryByRole('heading', { name: 'Updated note' }),
  ).not.toBeInTheDocument();
  await interactions.clear(
    screen.getByRole('searchbox', { name: 'Search notes' }),
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Archive Updated note' }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Updated note' }),
    ).not.toBeInTheDocument(),
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Archived', exact: true }),
  );
  await screen.findByRole('heading', { name: 'Updated note' });
  await interactions.click(
    screen.getByRole('button', { name: 'Restore Updated note' }),
  );
  await waitFor(() =>
    expect(fixture.spaces.data.notes[0].archived).toBe(false),
  );
  await interactions.click(
    screen.getByRole('button', { name: 'All', exact: true }),
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await interactions.click(
    screen.getByRole('button', { name: 'Delete Updated note' }),
  );
  await waitFor(() => expect(fixture.spaces.data.notes).toHaveLength(0));
});

test('quick capture opens the editor and reminder completion updates Today', async () => {
  const interactions = userEvent.setup();
  renderDashboard();
  await screen.findByRole('heading', { name: 'Hello, LifeOS.' });
  await interactions.click(
    screen.getByRole('link', { name: /Catch a thought/ }),
  );
  await screen.findByRole('textbox', { name: 'Title' });
  await interactions.type(screen.getByLabelText('Title'), 'Pay the bill');
  await interactions.selectOptions(screen.getByLabelText('Type'), 'reminder');
  await interactions.type(screen.getByLabelText('Reminder date'), dateKey());
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await screen.findByRole('heading', { name: 'Pay the bill' });
  await interactions.click(
    screen.getByRole('link', { name: 'Today', exact: true }),
  );
  await screen.findByText('Pay the bill');
  await interactions.click(
    screen.getByRole('button', { name: 'Complete Pay the bill' }),
  );
  await waitFor(() =>
    expect(screen.queryByText('Pay the bill')).not.toBeInTheDocument(),
  );
  expect(fixture.spaces.data.notes[0].completed).toBe(true);
});

test('logs and repeats a workout with date, duration, and exercise notes', async () => {
  const interactions = userEvent.setup();
  window.location.hash = '#workouts/new';
  renderDashboard();
  await screen.findByRole('textbox', { name: 'Workout name' });
  await interactions.click(
    screen.getByRole('button', { name: 'A walk', exact: true }),
  );
  await interactions.type(
    screen.getByLabelText('Exercises, sets & notes'),
    'A good walk',
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await screen.findByRole('heading', { name: 'A walk' });
  expect(fixture.spaces.data.workouts[0].duration).toBe(20);
  expect(fixture.spaces.data.workouts[0].exercises).toBe('A good walk');
  await interactions.click(
    screen.getByRole('button', { name: 'Repeat A walk' }),
  );
  expect(screen.getByLabelText('Workout name')).toHaveValue('A walk');
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await waitFor(() => expect(fixture.spaces.data.workouts).toHaveLength(2));
});

test('adds a routine and saves reversible check-ins across Today and its own space', async () => {
  const interactions = userEvent.setup();
  window.location.hash = '#routines/new';
  renderDashboard();
  await screen.findByRole('textbox', { name: 'Routine name' });
  await interactions.type(
    screen.getByLabelText('Routine name'),
    'Evening skin care',
  );
  await interactions.selectOptions(
    screen.getByLabelText('Category'),
    'Skin care',
  );
  await interactions.selectOptions(
    screen.getByLabelText('Time of day'),
    'Evening',
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await screen.findByRole('heading', { name: 'Evening skin care' });
  await interactions.click(
    screen.getByRole('button', { name: 'Complete Evening skin care' }),
  );
  await waitFor(() =>
    expect(fixture.spaces.data.routines[0].completedDates).toContain(dateKey()),
  );
  await interactions.click(
    screen.getByRole('link', { name: 'Today', exact: true }),
  );
  const routine = await screen.findByRole('button', {
    name: /Evening skin care/,
  });
  expect(routine).toHaveAttribute('aria-pressed', 'true');
  await interactions.click(routine);
  await waitFor(() =>
    expect(fixture.spaces.data.routines[0].completedDates).toHaveLength(0),
  );
});

test('adds a payment by hand from #money/new with Indian-style amounts', async () => {
  const interactions = userEvent.setup();
  window.location.hash = '#money/new';
  renderDashboard();
  const dialog = await screen.findByRole('dialog', { name: 'Add a payment' });
  await interactions.type(
    within(dialog).getByLabelText('Amount (₹)'),
    '1,186.40',
  );
  await interactions.type(
    within(dialog).getByLabelText('What was it?'),
    'Lunch',
  );
  await interactions.click(
    within(dialog).getByRole('button', { name: 'Save' }),
  );
  await waitFor(() => expect(fixture.money.state.txns).toHaveLength(1));
  expect(fixture.money.state.txns[0]).toMatchObject({
    amountMinor: 118640,
    title: 'Lunch',
    direction: 'debit',
  });
});

test('failed loading is retryable and does not show misleading empty tracker totals', async () => {
  fixture.fetch.mockResolvedValueOnce(
    json({ message: 'Database unavailable.' }, 503),
  );
  renderDashboard();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Database unavailable.',
  );
  expect(screen.queryByText('₹0.00')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await screen.findByRole('heading', { name: 'Hello, LifeOS.' });
});

test('a failed save preserves the draft and does not pretend it was saved', async () => {
  const interactions = userEvent.setup();
  window.location.hash = '#notes/new';
  renderDashboard();
  await screen.findByLabelText('Title');
  await interactions.type(screen.getByLabelText('Title'), 'Keep my draft');
  fixture.fetch.mockResolvedValueOnce(
    json({ message: 'Cannot save right now.' }, 503),
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Cannot save right now.',
  );
  expect(screen.getByLabelText('Title')).toHaveValue('Keep my draft');
  expect(fixture.spaces.data.notes).toHaveLength(0);
});

test('keeps logout errors visible and disables logout while waiting', async () => {
  const onLogout = vi.fn();
  const { rerender } = renderDashboard({
    onLogout,
    error: 'Cannot reach the server.',
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Cannot reach the server.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(onLogout).toHaveBeenCalledOnce();
  rerender(<Dashboard user={user} busy error="" onLogout={onLogout} />);
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
});
