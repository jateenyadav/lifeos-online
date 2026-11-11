import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeleteAccount from '../DeleteAccount.jsx';

afterEach(() => vi.restoreAllMocks());

describe('Delete account (web)', () => {
  it('needs DELETE + password, calls the API, then signs the user out', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const onDeleted = vi.fn();
    render(<DeleteAccount user={{ name: 'A', email: 'a@x.com', provider: 'password' }} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByText('Delete account'));
    const button = screen.getByRole('button', { name: /Delete my account forever/ });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: 'DELETE' } });
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'a-correct-password' } });
    fireEvent.click(button);
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/auth\/account$/);
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ confirmation: 'DELETE', password: 'a-correct-password' });
  });

  it('shows the server error and keeps the account when the password is wrong', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Incorrect password.' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
    );
    const onDeleted = vi.fn();
    render(<DeleteAccount user={{ name: 'A', email: 'a@x.com', provider: 'password' }} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByText('Delete account'));
    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: 'DELETE' } });
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Delete my account forever/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password.');
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
