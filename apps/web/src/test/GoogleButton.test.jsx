import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GoogleButton from '../GoogleButton.jsx';

beforeEach(() => {
  vi.stubEnv(
    'VITE_GOOGLE_CLIENT_ID',
    '123456789-web-test.apps.googleusercontent.com',
  );
  vi.stubGlobal('google', undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  document
    .querySelectorAll('script[src="https://accounts.google.com/gsi/client"]')
    .forEach((script) => script.remove());
});

test('retries a failed Google script download', async () => {
  const onError = vi.fn();
  const interactions = userEvent.setup();
  render(
    <GoogleButton onCredential={vi.fn()} onError={onError} disabled={false} />,
  );
  const script = document.querySelector(
    'script[src="https://accounts.google.com/gsi/client"]',
  );
  await act(async () => script.dispatchEvent(new Event('error')));
  expect(onError).toHaveBeenCalledWith(
    expect.stringContaining('Check your connection'),
  );
  await interactions.click(
    screen.getByRole('button', { name: 'Retry Google sign-in' }),
  );
  const retry = document.querySelector(
    'script[src="https://accounts.google.com/gsi/client"]',
  );
  expect(retry).not.toBe(script);
  await act(async () => retry.dispatchEvent(new Event('error')));
});

test('times out a stalled Google script instead of leaving a blank button', async () => {
  vi.useFakeTimers();
  const onError = vi.fn();
  render(
    <GoogleButton onCredential={vi.fn()} onError={onError} disabled={false} />,
  );
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(onError).toHaveBeenCalledWith(
    expect.stringContaining('took too long'),
  );
  expect(
    screen.getByRole('button', { name: 'Retry Google sign-in' }),
  ).toBeInTheDocument();
});

test('can retry if a script loads without the Google SDK', async () => {
  const onError = vi.fn();
  render(
    <GoogleButton onCredential={vi.fn()} onError={onError} disabled={false} />,
  );
  const script = document.querySelector(
    'script[src="https://accounts.google.com/gsi/client"]',
  );
  await act(async () => script.dispatchEvent(new Event('load')));
  expect(onError).toHaveBeenCalledWith(
    expect.stringContaining('could not load'),
  );
  expect(
    screen.getByRole('button', { name: 'Retry Google sign-in' }),
  ).toBeInTheDocument();
});

test('uses the configured client ID and ignores callbacks while disabled or unmounted', async () => {
  const initialize = vi.fn();
  const renderButton = vi.fn();
  vi.stubGlobal('google', { accounts: { id: { initialize, renderButton } } });
  const onCredential = vi.fn();
  const onError = vi.fn();
  const props = { onCredential, onError, disabled: false };
  const view = render(<GoogleButton {...props} />);
  await waitFor(() => expect(initialize).toHaveBeenCalled());
  expect(initialize.mock.calls[0][0]).toMatchObject({
    client_id: '123456789-web-test.apps.googleusercontent.com',
    auto_select: false,
    ux_mode: 'popup',
  });
  expect(renderButton).toHaveBeenCalledWith(
    screen.getByLabelText('Google sign-in'),
    expect.objectContaining({ text: 'continue_with' }),
  );
  const callback = initialize.mock.calls[0][0].callback;
  callback({ credential: 'first-token' });
  expect(onCredential).toHaveBeenCalledWith('first-token');
  view.rerender(<GoogleButton {...props} disabled />);
  callback({ credential: 'busy-token' });
  expect(onCredential).toHaveBeenCalledTimes(1);
  view.unmount();
  callback({ credential: 'late-token' });
  expect(onCredential).toHaveBeenCalledTimes(1);
});

test('reports an empty Google response without authenticating', async () => {
  const initialize = vi.fn();
  vi.stubGlobal('google', {
    accounts: { id: { initialize, renderButton: vi.fn() } },
  });
  const onCredential = vi.fn();
  const onError = vi.fn();
  render(
    <GoogleButton
      onCredential={onCredential}
      onError={onError}
      disabled={false}
    />,
  );
  await waitFor(() => expect(initialize).toHaveBeenCalled());
  initialize.mock.calls[0][0].callback({});
  expect(onError).toHaveBeenCalledWith(
    expect.stringContaining('identity token'),
  );
  expect(onCredential).not.toHaveBeenCalled();
});

test('resizes the Google button with the form and removes old content', async () => {
  let notifyResize;
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        notifyResize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const renderButton = vi.fn((element) => {
    element.appendChild(document.createElement('button'));
  });
  vi.stubGlobal('google', {
    accounts: { id: { initialize: vi.fn(), renderButton } },
  });
  const view = render(
    <GoogleButton onCredential={vi.fn()} onError={vi.fn()} disabled={false} />,
  );
  const container = screen.getByLabelText('Google sign-in');
  let width = 400;
  Object.defineProperty(container, 'clientWidth', { get: () => width });
  await waitFor(() => expect(observe).toHaveBeenCalledWith(container));
  expect(renderButton).toHaveBeenLastCalledWith(
    container,
    expect.objectContaining({ width: 400 }),
  );
  width = 240;
  act(() => notifyResize());
  expect(renderButton).toHaveBeenLastCalledWith(
    container,
    expect.objectContaining({ width: 240 }),
  );
  expect(container.children).toHaveLength(1);
  act(() => notifyResize());
  expect(renderButton).toHaveBeenCalledTimes(2);
  width = 600;
  act(() => notifyResize());
  expect(renderButton).toHaveBeenLastCalledWith(
    container,
    expect.objectContaining({ width: 400 }),
  );
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  act(() => notifyResize());
  expect(renderButton).toHaveBeenCalledTimes(3);
});

test('resizes on window changes when ResizeObserver is unavailable', async () => {
  vi.stubGlobal('ResizeObserver', undefined);
  const renderButton = vi.fn();
  vi.stubGlobal('google', {
    accounts: { id: { initialize: vi.fn(), renderButton } },
  });
  const view = render(
    <GoogleButton onCredential={vi.fn()} onError={vi.fn()} disabled={false} />,
  );
  const container = screen.getByLabelText('Google sign-in');
  let width = 360;
  Object.defineProperty(container, 'clientWidth', { get: () => width });
  await waitFor(() => expect(renderButton).toHaveBeenCalled());
  width = 280;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(renderButton).toHaveBeenLastCalledWith(
    container,
    expect.objectContaining({ width: 280 }),
  );
  view.unmount();
  act(() => window.dispatchEvent(new Event('resize')));
  expect(renderButton).toHaveBeenCalledTimes(2);
});
