import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TellLifeOS from '../workspaces/TellLifeOS.jsx';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.restoreAllMocks());

describe('Tell LifeOS', () => {
  it('shows the proposal and only saves after the user presses Save', async () => {
    const proposal = { collection: 'expenses', values: { title: 'Lunch', amountMinor: 25000, date: '2026-11-10', category: 'Food', payment: 'UPI', note: '' }, summary: 'Add expense: Lunch, ₹250 (Food) on 2026-11-10?' };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ reply: proposal.summary, proposal }))
      .mockResolvedValueOnce(json({ entry: { id: '1' } }, 201));
    render(<TellLifeOS />);
    fireEvent.change(screen.getByLabelText('Tell LifeOS what happened'), { target: { value: 'spent 250 on lunch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByText(/Add expense: Lunch/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing saved yet
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.message).toBe('spent 250 on lunch');
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved to Spending.'));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toMatch(/\/workspaces\/expenses$/);
    expect(JSON.parse(init.body)).toEqual(proposal.values);
  });

  it('Cancel discards the proposal without saving', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({ reply: 'Save note: "x"?', proposal: { collection: 'notes', values: { title: 'x' }, summary: 'Save note: "x"?' } }),
    );
    render(<TellLifeOS />);
    fireEvent.change(screen.getByLabelText('Tell LifeOS what happened'), { target: { value: 'note x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    fireEvent.click(await screen.findByRole('button', { name: /Cancel/ }));
    expect(screen.queryByText('Save note: "x"?')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
