import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';

const user = {
  id: 'user-1',
  name: 'LifeOS Learner',
  email: 'demo@lifeos.local',
  provider: 'password',
};
const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((path) =>
      Promise.resolve(
        path === '/api/workspaces'
          ? jsonResponse({
              notes: [],
              workouts: [],
              routines: [],
              expenses: [],
              budgets: [],
            })
          : jsonResponse({ message: 'Please sign in.' }, 401),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('renders the login form and toggles password visibility', async () => {
  const interactions = userEvent.setup();
  render(<App />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeEnabled(),
  );
  expect(screen.getByLabelText('Your ID or email')).toBeInTheDocument();
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Show password' }),
  );
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  expect(
    screen.getByRole('button', { name: /Continue with Google/ }),
  ).toBeDisabled();
});

test('switching forms brings the heading back into view', async () => {
  const interactions = userEvent.setup();
  const { container } = render(<App />);
  const switchButton = screen.getByRole('button', {
    name: 'New here? Create account',
  });
  await waitFor(() => expect(switchButton).toBeEnabled());
  const scrollIntoView = vi.fn();
  container.querySelector('.login-content').scrollIntoView = scrollIntoView;
  await interactions.click(switchButton);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  expect(
    screen.getByRole('heading', { name: 'A fresh start.' }),
  ).toBeInTheDocument();
  await interactions.click(
    screen.getByRole('button', { name: 'Already have an account? Sign in' }),
  );
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
});

test('authentication errors scroll into view', async () => {
  const interactions = userEvent.setup();
  const scrollIntoView = vi.fn();
  const originalScroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  try {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByLabelText('Your ID or email')).toBeEnabled(),
    );
    fetch.mockResolvedValueOnce(
      jsonResponse({ message: 'Incorrect password.' }, 401),
    );
    await interactions.type(screen.getByLabelText('Your ID or email'), 'demo');
    await interactions.type(
      screen.getByLabelText('Password', { exact: true }),
      'wrong-password',
    );
    await interactions.click(
      screen.getByRole('button', { name: 'Sign in', exact: true }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect password.',
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  } finally {
    if (originalScroll) HTMLElement.prototype.scrollIntoView = originalScroll;
    else delete HTMLElement.prototype.scrollIntoView;
  }
});

test('logs in using the shared API and signs out', async () => {
  const interactions = userEvent.setup();
  render(<App />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeEnabled(),
  );
  fetch.mockResolvedValueOnce(jsonResponse({ user }));
  await interactions.type(screen.getByLabelText('Your ID or email'), 'demo');
  await interactions.type(
    screen.getByLabelText('Password', { exact: true }),
    'a-correct-password',
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Sign in', exact: true }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Hello, LifeOS.' }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('navigation', { name: 'Workspaces' })).getAllByRole(
      'link',
    ),
  ).toHaveLength(6);
  expect(fetch).toHaveBeenCalledWith(
    '/api/auth/login',
    expect.objectContaining({
      credentials: 'include',
      body: JSON.stringify({
        identifier: 'demo',
        password: 'a-correct-password',
      }),
    }),
  );
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await interactions.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(
    await screen.findByRole('button', { name: 'Sign in', exact: true }),
  ).toBeInTheDocument();
});

test('shows wrong-password errors without authenticating', async () => {
  const interactions = userEvent.setup();
  render(<App />);
  await waitFor(() =>
    expect(screen.getByLabelText('Your ID or email')).toBeEnabled(),
  );
  fetch.mockResolvedValueOnce(
    jsonResponse({ message: 'Incorrect ID/email or password.' }, 401),
  );
  await interactions.type(screen.getByLabelText('Your ID or email'), 'demo');
  await interactions.type(
    screen.getByLabelText('Password', { exact: true }),
    'wrong-password',
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Sign in', exact: true }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Incorrect ID/email or password.',
  );
});

test('restores an existing cookie session', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ user }));
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Hello, LifeOS.' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Today', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByLabelText('Your ID or email')).not.toBeInTheDocument();
});

test('hides workspaces after logout and restores the selected space on the next login', async () => {
  const interactions = userEvent.setup();
  fetch.mockResolvedValueOnce(jsonResponse({ user }));
  render(<App />);
  await screen.findByRole('link', { name: 'Spending tracker' });
  await interactions.click(
    screen.getByRole('link', { name: 'Spending tracker' }),
  );
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await interactions.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('button', { name: 'Sign in', exact: true });
  expect(
    screen.queryByRole('navigation', { name: 'Workspaces' }),
  ).not.toBeInTheDocument();
  await interactions.type(screen.getByLabelText('Your ID or email'), 'demo');
  await interactions.type(
    screen.getByLabelText('Password', { exact: true }),
    'a-password',
  );
  fetch.mockResolvedValueOnce(jsonResponse({ user }));
  await interactions.click(
    screen.getByRole('button', { name: 'Sign in', exact: true }),
  );
  expect(
    await screen.findByRole('heading', {
      name: 'Spending tracker',
      exact: true,
    }),
  ).toBeInTheDocument();
});

test('shows an actionable error if the server is offline', async () => {
  fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Cannot reach the server',
  );
});

test('sends the Google identity token to the backend and signs out', async () => {
  vi.stubEnv(
    'VITE_GOOGLE_CLIENT_ID',
    '123456789-web-test.apps.googleusercontent.com',
  );
  const initialize = vi.fn();
  vi.stubGlobal('google', {
    accounts: { id: { initialize, renderButton: vi.fn() } },
  });
  const interactions = userEvent.setup();
  render(<App />);
  await waitFor(() =>
    expect(screen.getByLabelText('Your ID or email')).toBeEnabled(),
  );
  await waitFor(() => expect(initialize).toHaveBeenCalled());
  const googleUser = { ...user, name: 'Google Learner', provider: 'google' };
  fetch.mockResolvedValueOnce(jsonResponse({ user: googleUser }));
  initialize.mock.calls[0][0].callback({ credential: 'google-identity-token' });
  expect(
    await screen.findByRole('heading', { name: 'Hello, Google.' }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('navigation', { name: 'Workspaces' })).getAllByRole(
      'link',
    ),
  ).toHaveLength(6);
  expect(fetch).toHaveBeenCalledWith(
    '/api/auth/google',
    expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ idToken: 'google-identity-token' }),
    }),
  );
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await interactions.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(
    await screen.findByRole('button', { name: 'Sign in', exact: true }),
  ).toBeInTheDocument();
});

test('shows a rejected Google token without signing in', async () => {
  vi.stubEnv(
    'VITE_GOOGLE_CLIENT_ID',
    '123456789-web-test.apps.googleusercontent.com',
  );
  const initialize = vi.fn();
  vi.stubGlobal('google', {
    accounts: { id: { initialize, renderButton: vi.fn() } },
  });
  render(<App />);
  await waitFor(() =>
    expect(screen.getByLabelText('Your ID or email')).toBeEnabled(),
  );
  await waitFor(() => expect(initialize).toHaveBeenCalled());
  fetch.mockResolvedValueOnce(
    jsonResponse(
      { message: 'Google could not verify your sign-in. Please try again.' },
      401,
    ),
  );
  initialize.mock.calls[0][0].callback({ credential: 'invalid-google-token' });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Google could not verify your sign-in.',
  );
  expect(screen.queryByText('Successfully signed in')).not.toBeInTheDocument();
});

async function openRegistration(interactions) {
  await waitFor(() =>
    expect(screen.getByLabelText('Your ID or email')).toBeEnabled(),
  );
  await interactions.click(
    screen.getByRole('button', { name: 'New here? Create account' }),
  );
  await interactions.type(screen.getByLabelText('Your name'), 'New Learner');
  await interactions.type(
    screen.getByLabelText('Email address'),
    'learner@example.com',
  );
  await interactions.type(
    screen.getByLabelText('Password', { exact: true }),
    'new-password',
  );
}

test('registers with email and signs into the new account immediately', async () => {
  const interactions = userEvent.setup();
  render(<App />);
  await openRegistration(interactions);
  await interactions.type(
    screen.getByLabelText('Confirm password'),
    'new-password',
  );
  fetch.mockResolvedValueOnce(
    jsonResponse({ user: { ...user, name: 'New Learner' } }, 201),
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Create account', exact: true }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Hello, New.' }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('navigation', { name: 'Workspaces' })).getAllByRole(
      'link',
    ),
  ).toHaveLength(6);
  expect(fetch).toHaveBeenCalledWith(
    '/api/auth/register',
    expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        name: 'New Learner',
        email: 'learner@example.com',
        password: 'new-password',
        confirmPassword: 'new-password',
      }),
    }),
  );
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await interactions.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(
    await screen.findByRole('button', { name: 'Sign in', exact: true }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
});

test('mismatched registration passwords are rejected before sending a request', async () => {
  const interactions = userEvent.setup();
  render(<App />);
  await openRegistration(interactions);
  await interactions.type(
    screen.getByLabelText('Confirm password'),
    'different-password',
  );
  const callsBeforeSubmit = fetch.mock.calls.length;
  await interactions.click(
    screen.getByRole('button', { name: 'Create account', exact: true }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Passwords do not match.',
  );
  expect(fetch).toHaveBeenCalledTimes(callsBeforeSubmit);
});

test('short registration passwords are rejected before sending a request', async () => {
  const interactions = userEvent.setup();
  render(<App />);
  await openRegistration(interactions);
  await interactions.clear(screen.getByLabelText('Password', { exact: true }));
  await interactions.type(
    screen.getByLabelText('Password', { exact: true }),
    'short',
  );
  await interactions.type(screen.getByLabelText('Confirm password'), 'short');
  const callsBeforeSubmit = fetch.mock.calls.length;
  await interactions.click(
    screen.getByRole('button', { name: 'Create account', exact: true }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Password must be at least 8 characters.',
  );
  expect(fetch).toHaveBeenCalledTimes(callsBeforeSubmit);
});

test('duplicate email errors remain visible and switching to login clears passwords', async () => {
  const interactions = userEvent.setup();
  render(<App />);
  await openRegistration(interactions);
  await interactions.type(
    screen.getByLabelText('Confirm password'),
    'new-password',
  );
  fetch.mockResolvedValueOnce(
    jsonResponse({ message: 'This email already has an account.' }, 409),
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Create account', exact: true }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This email already has an account.',
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Already have an account? Sign in' }),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Your ID or email')).toHaveValue(
    'learner@example.com',
  );
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
});
