import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonalAi from '../workspaces/PersonalAi.jsx';
import { apiRequest } from '../api.js';
import { cloudConnectionSafe } from '../workspaces/ai-utils.js';

vi.mock('../api.js', () => ({ apiRequest: vi.fn() }));

test('cloud keys never travel over a remote plain HTTP connection', () => {
  expect(cloudConnectionSafe('http://localhost:5173')).toBe(true);
  expect(cloudConnectionSafe('http://192.168.1.5:5173')).toBe(false);
  expect(
    cloudConnectionSafe(
      'https://lifeos.example',
      'https://api.lifeos.example/api',
    ),
  ).toBe(true);
  expect(
    cloudConnectionSafe(
      'https://lifeos.example',
      'http://api.lifeos.example/api',
    ),
  ).toBe(false);
  expect(
    cloudConnectionSafe('http://localhost:5173', 'http://192.168.1.5:4000/api'),
  ).toBe(false);
});
beforeEach(() => {
  apiRequest.mockImplementation(async (path) => {
    if (path === '/ai/status')
      return {
        local: {
          available: true,
          models: ['llama3.2:3b'],
          message: 'Ollama ready',
        },
        defaultModel: 'llama3.2:3b',
      };
    if (path === '/ai/knowledge') return { documents: [] };
    if (path === '/ai/chat')
      return {
        provider: 'local',
        model: 'llama3.2:3b',
        answer: 'Your saved workout is leg day. [S1]',
        sources: [{ label: 'S1', title: 'Leg day', kind: 'workouts' }],
      };
    throw new Error(`Unexpected path: ${path}`);
  });
});

test('defaults to local AI and sends no credentials or client-built context', async () => {
  const interactions = userEvent.setup();
  render(<PersonalAi />);
  await screen.findByText('Ollama ready');
  expect(screen.getByLabelText('AI connection')).toHaveValue('local');
  await interactions.type(
    screen.getByLabelText('Your question'),
    'What workouts did I save?',
  );
  await interactions.click(screen.getByRole('button', { name: 'Ask AI' }));
  await screen.findByText('Your saved workout is leg day. [S1]');
  const body = apiRequest.mock.calls.find(([path]) => path === '/ai/chat')[1]
    .body;
  expect(body).toMatchObject({
    provider: 'local',
    model: 'llama3.2:3b',
    topics: ['workouts', 'routines', 'spending'],
  });
  expect(body.credentials).toBeUndefined();
  expect(body.context).toBeUndefined();
  expect(body.history).toEqual([]);
  expect(screen.getByText('[S1] Leg day (workouts)')).toBeInTheDocument();
});

test('cloud needs consent and switching provider clears keys and chat', async () => {
  const interactions = userEvent.setup();
  render(<PersonalAi />);
  await screen.findByText('Ollama ready');
  await interactions.selectOptions(
    screen.getByLabelText('AI connection'),
    'openai',
  );
  await interactions.type(
    screen.getByLabelText('OpenAI API key'),
    'private-api-key',
  );
  await interactions.type(
    screen.getByLabelText('Your question'),
    'Summarize my workouts',
  );
  expect(screen.getByRole('button', { name: 'Ask AI' })).toBeDisabled();
  await interactions.click(
    screen.getByLabelText(
      'I agree to send the selected data and chat to this cloud provider.',
    ),
  );
  await interactions.click(screen.getByRole('button', { name: 'Ask AI' }));
  await screen.findByText('Your saved workout is leg day. [S1]');
  const body = apiRequest.mock.calls.find(([path]) => path === '/ai/chat')[1]
    .body;
  expect(body).toMatchObject({
    provider: 'openai',
    cloudConsent: true,
    credentials: { apiKey: 'private-api-key' },
  });
  await interactions.selectOptions(
    screen.getByLabelText('AI connection'),
    'local',
  );
  expect(
    screen.queryByText('Your saved workout is leg day. [S1]'),
  ).not.toBeInTheDocument();
  await interactions.selectOptions(
    screen.getByLabelText('AI connection'),
    'openai',
  );
  expect(screen.getByLabelText('OpenAI API key')).toHaveValue('');
  expect(
    screen.getByLabelText(
      'I agree to send the selected data and chat to this cloud provider.',
    ),
  ).not.toBeChecked();
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
  await screen.findByText('Ollama ready');
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
  await interactions.selectOptions(
    screen.getByLabelText('AI connection'),
    'openai',
  );
  await interactions.click(
    screen.getByLabelText(
      'I agree to send the selected data and chat to this cloud provider.',
    ),
  );
  await interactions.click(screen.getByLabelText('Spending'));
  expect(
    screen.getByLabelText(
      'I agree to send the selected data and chat to this cloud provider.',
    ),
  ).not.toBeChecked();
});

test('shows failures and handles an expired login', async () => {
  const expired = vi.fn();
  apiRequest.mockRejectedValue({
    status: 401,
    message: 'Please sign in again.',
  });
  render(<PersonalAi onSessionExpired={expired} />);
  await screen.findByRole('alert');
  expect(screen.getByText('Please sign in again.')).toBeInTheDocument();
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});
