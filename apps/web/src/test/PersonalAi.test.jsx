import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonalAi from '../workspaces/PersonalAi.jsx';
import { apiRequest } from '../api.js';

vi.mock('../api.js', () => ({ apiRequest: vi.fn() }));

beforeEach(() => {
  apiRequest.mockImplementation(async (path) => {
    if (path === '/ai/status')
      return { lifeos: { available: true, dailyLimit: 30, remaining: 12 } };
    if (path === '/ai/knowledge') return { documents: [] };
    if (path === '/ai/chat')
      return {
        provider: 'lifeos',
        model: 'llama-3.1-8b',
        answer: 'Your saved workout is leg day. [S1]',
        sources: [{ label: 'S1', title: 'Leg day', kind: 'workouts' }],
        remainingToday: 11,
      };
    if (path === '/ai/act') return { reply: 'Hi' };
    throw new Error(`Unexpected path: ${path}`);
  });
});

test('only LifeOS AI is offered: no local AI, no key fields', async () => {
  render(<PersonalAi />);
  await screen.findByText(/12 left today/);
  expect(screen.queryByLabelText('AI connection')).not.toBeInTheDocument();
  expect(screen.queryByText(/Ollama/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/API key/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/AWS/)).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Tell LifeOS' }),
  ).toBeInTheDocument();
});

test('asks LifeOS AI only after consent and sends no credentials or client context', async () => {
  const interactions = userEvent.setup();
  render(<PersonalAi />);
  await screen.findByText(/12 left today/);
  await interactions.type(
    screen.getByLabelText('Your question'),
    'What workouts did I save?',
  );
  expect(screen.getByRole('button', { name: 'Ask AI' })).toBeDisabled();
  await interactions.click(
    screen.getByLabelText(
      'I agree to send the selected data and chat to LifeOS AI.',
    ),
  );
  await interactions.click(screen.getByRole('button', { name: 'Ask AI' }));
  await screen.findByText('Your saved workout is leg day. [S1]');
  const body = apiRequest.mock.calls.find(([path]) => path === '/ai/chat')[1]
    .body;
  expect(body).toMatchObject({
    provider: 'lifeos',
    cloudConsent: true,
    topics: ['workouts', 'routines', 'spending'],
    history: [],
  });
  expect(body.credentials).toBeUndefined();
  expect(body.context).toBeUndefined();
  expect(body.model).toBeUndefined();
  expect(screen.getByText('[S1] Leg day (workouts)')).toBeInTheDocument();
  expect(screen.getByText(/11 left today/)).toBeInTheDocument();
});

test('saving knowledge makes it available and changing data scopes resets consent', async () => {
  const interactions = userEvent.setup();
  const original = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) =>
    path === '/ai/knowledge' && options?.method === 'POST'
      ? { document: { id: 'doc-1', ...options.body } }
      : original(path, options),
  );
  render(<PersonalAi />);
  await screen.findByText(/12 left today/);
  await interactions.type(
    screen.getByLabelText('Knowledge title'),
    'My skin care',
  );
  await interactions.selectOptions(
    screen.getByLabelText('Knowledge topic'),
    'routines',
  );
  await interactions.type(
    screen.getByLabelText('Knowledge text'),
    'My product is Example Cream.',
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Save knowledge' }),
  );
  await screen.findByText('My skin care');
  expect(screen.getByLabelText('Knowledge text')).toHaveValue('');
  const consent = screen.getByLabelText(
    'I agree to send the selected data and chat to LifeOS AI.',
  );
  await interactions.click(consent);
  await interactions.click(screen.getByLabelText('Money'));
  expect(consent).not.toBeChecked();
});

test('shows failures and handles an expired login', async () => {
  const expired = vi.fn();
  apiRequest.mockRejectedValue({
    status: 401,
    message: 'Please sign in again.',
  });
  render(<PersonalAi onSessionExpired={expired} />);
  await screen.findByText('Please sign in again.');
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});
