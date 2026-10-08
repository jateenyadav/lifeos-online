import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../Dashboard.jsx';
import { workspaceFixture } from './workspace-fixture.js';
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
  fixture = workspaceFixture();
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

test('loads Today and navigates to four independent spaces with real addresses', async () => {
  const interactions = userEvent.setup();
  renderDashboard();
  await screen.findByRole('heading', { name: 'Hello, LifeOS.' });
  expect(
    within(screen.getByRole('navigation', { name: 'Workspaces' })).getAllByRole(
      'link',
    ),
  ).toHaveLength(6);
  expect(screen.getByRole('link', { name: 'Personal AI' })).toHaveAttribute(
    'href',
    '#ai',
  );
  for (const [title, hash, action] of [
    ['Notes & reminders', '#notes', 'New note'],
    ['Workout tracker', '#workouts', 'Log workout'],
    ['Daily routines', '#routines', 'Add routine'],
    ['Spending tracker', '#spending', 'Add expense'],
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
  expect(fixture.data.notes[0].body).toBe('A useful thought');
  await interactions.click(
    screen.getByRole('button', { name: 'Pin My real note' }),
  );
  await waitFor(() => expect(fixture.data.notes[0].pinned).toBe(true));
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
  await waitFor(() => expect(fixture.data.notes[0].archived).toBe(false));
  await interactions.click(
    screen.getByRole('button', { name: 'All', exact: true }),
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await interactions.click(
    screen.getByRole('button', { name: 'Delete Updated note' }),
  );
  await waitFor(() => expect(fixture.data.notes).toHaveLength(0));
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
  expect(fixture.data.notes[0].completed).toBe(true);
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
  expect(fixture.data.workouts[0].duration).toBe(20);
  expect(fixture.data.workouts[0].exercises).toBe('A good walk');
  await interactions.click(
    screen.getByRole('button', { name: 'Repeat A walk' }),
  );
  expect(screen.getByLabelText('Workout name')).toHaveValue('A walk');
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await waitFor(() => expect(fixture.data.workouts).toHaveLength(2));
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
    expect(fixture.data.routines[0].completedDates).toContain(dateKey()),
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
    expect(fixture.data.routines[0].completedDates).toHaveLength(0),
  );
});

test('stores exact expenses and monthly budgets and calculates remaining money', async () => {
  const interactions = userEvent.setup();
  window.location.hash = '#spending/new';
  renderDashboard();
  await screen.findByRole('textbox', { name: 'What was it for?' });
  await interactions.type(screen.getByLabelText('What was it for?'), 'Lunch');
  await interactions.type(screen.getByLabelText('Amount (INR)'), '25.05');
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await screen.findByRole('heading', { name: 'Lunch' });
  expect(fixture.data.expenses[0].amountMinor).toBe(2505);
  await interactions.click(
    screen.getByRole('button', { name: 'Set budget', exact: true }),
  );
  await interactions.type(
    screen.getByLabelText('Monthly budget (INR)'),
    '100.00',
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await waitFor(() => expect(fixture.data.budgets[0]?.limitMinor).toBe(10000));
  expect(screen.getByText('₹74.95')).toBeInTheDocument();
  await interactions.click(
    screen.getByRole('button', { name: 'Add expense', exact: true }),
  );
  await interactions.type(
    screen.getByLabelText('What was it for?'),
    'Invalid amount',
  );
  await interactions.type(screen.getByLabelText('Amount (INR)'), '1.001');
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'at most two decimal places',
  );
  expect(fixture.data.expenses).toHaveLength(1);
});

test('failed loading is retryable and does not show misleading empty tracker totals', async () => {
  fixture.fetch.mockResolvedValueOnce(
    fixture.response({ message: 'Database unavailable.' }, 503),
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
    fixture.response({ message: 'Cannot save right now.' }, 503),
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Cannot save right now.',
  );
  expect(screen.getByLabelText('Title')).toHaveValue('Keep my draft');
  expect(fixture.data.notes).toHaveLength(0);
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
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(onLogout).toHaveBeenCalledOnce();
  rerender(<Dashboard user={user} busy error="" onLogout={onLogout} />);
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
});
