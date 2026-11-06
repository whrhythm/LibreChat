import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { personalPaymentRequest } from 'librechat-data-provider';
import Payment from './Payment';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'alice' }, token: 'synthetic' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  personalPaymentRequest: jest.fn(),
}));
const request = personalPaymentRequest as jest.Mock;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Payment orderId="owned-order" pending />
    </QueryClientProvider>,
  );
}
beforeEach(() => request.mockReset());

it('opens a signed checkout without marking payment or entitlement as confirmed', async () => {
  request
    .mockResolvedValueOnce({ state: 'not_started', checkout_url: null })
    .mockResolvedValueOnce({
      state: 'awaiting_payment',
      checkout_url: 'http://127.0.0.1:9066/checkout/order',
    });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'com_codechat_payment_create' }));
  expect(await screen.findByRole('link', { name: 'com_codechat_payment_open' })).toHaveAttribute(
    'href',
    'http://127.0.0.1:9066/checkout/order',
  );
  expect(request).toHaveBeenLastCalledWith('synthetic', 'owned-order', 'checkout');
  expect(screen.queryByText('com_codechat_payment_confirmed')).not.toBeInTheDocument();
});

it('restores an uncertain result and offers verification instead of another payment', async () => {
  request.mockResolvedValue({ state: 'requires_review', checkout_url: null });
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('com_codechat_payment_review');
  expect(
    screen.queryByRole('button', { name: 'com_codechat_payment_create' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_payment_refresh' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
});

it('keeps payment confirmation distinct from resource activation', async () => {
  request.mockResolvedValue({ state: 'confirmed', checkout_url: null });
  mount();
  expect(await screen.findByRole('status')).toHaveTextContent('com_codechat_payment_confirmed');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
