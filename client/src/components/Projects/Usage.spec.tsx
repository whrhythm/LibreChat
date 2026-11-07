import { render, screen } from '@testing-library/react';
import { personalCapacityRequest } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Usage from './Usage';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'test' }),
  useLocalize: () => (key: string, values?: { total?: string }) =>
    key + (values?.total ? ':' + values.total : ''),
}));
jest.mock('~/components/CodeChat/config', () => ({ isCodeChatEnabled: () => true }));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  personalCapacityRequest: jest.fn(),
}));

function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
    >
      <Usage />
    </QueryClientProvider>,
  );
}
it('shows actual account limits and tokens without inventing a token quota', async () => {
  (personalCapacityRequest as jest.Mock).mockResolvedValue({
    storage: {
      known_used_bytes: 1024,
      budget_bytes: 4096,
      complete: true,
      components: [{ status: 'ok' }],
    },
    applications: { used: 2, limit: 3 },
    wallet: {
      status: 'ok',
      spent_usd_micros: 500000,
      allocated_usd_micros: 2000000,
      total_tokens: 1234,
      estimated_tokens: 999999,
    },
  });
  mount();
  expect(await screen.findByText('$0.50 / $2.00')).toBeVisible();
  expect(screen.getByText('2 / 3')).toBeVisible();
  expect(screen.getByText('com_codechat_member_tokens_used:1,234')).toBeVisible();
  expect(screen.queryByText(/999/)).not.toBeInTheDocument();
});
it('marks missing measurements rather than presenting zero usage', async () => {
  (personalCapacityRequest as jest.Mock).mockResolvedValue({
    storage: { known_used_bytes: null, budget_bytes: 4096, complete: false, components: [] },
    applications: { used: 0, limit: 0 },
    wallet: { status: 'unknown' },
  });
  mount();
  expect(await screen.findByText('com_codechat_member_tokens_used:—')).toBeVisible();
  expect(screen.getAllByText('com_codechat_space_partial_status').length).toBeGreaterThan(0);
  expect(screen.queryByText('$0.00 / $0.00')).not.toBeInTheDocument();
});
