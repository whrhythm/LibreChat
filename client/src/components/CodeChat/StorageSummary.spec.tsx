import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { personalCapacityRequest, QueryKeys } from 'librechat-data-provider';
import StorageSummary from './StorageSummary';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'storage-test' }, token: 'synthetic' }),
  useLocalize: () => (key: string, values?: { used?: string; limit?: string }) =>
    values?.used ? `${key}: ${values.used} / ${values.limit}` : key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  personalCapacityRequest: jest.fn(),
}));
const request = personalCapacityRequest as jest.Mock;
const storage = {
  budget_bytes: 1073741824,
  known_used_bytes: 536870912,
  complete: true,
  components: [{ status: 'ok', observed_at: '2026-11-04T00:00:00Z' }],
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StorageSummary />
    </QueryClientProvider>,
  );
  return client;
}

it('keeps the last measured total after a refresh failure and clears the warning on recovery', async () => {
  request.mockResolvedValue({ storage });
  const client = mount();
  await screen.findByText('com_codechat_space_used: 512.0 MiB / 1.0 GiB');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  request.mockRejectedValue(new Error('synthetic timeout'));
  await act(async () => {
    await client.invalidateQueries([QueryKeys.codechatCapacity, 'storage-test']);
  });
  await screen.findByText('com_codechat_space_stale');
  expect(screen.getByText('com_codechat_space_used: 512.0 MiB / 1.0 GiB')).toBeVisible();
  request.mockResolvedValue({ storage });
  await act(async () => {
    await client.invalidateQueries([QueryKeys.codechatCapacity, 'storage-test']);
  });
  await screen.findByText('com_codechat_space_observed');
  expect(screen.queryByText('com_codechat_space_stale')).not.toBeInTheDocument();
});

it('does not represent unmeasured storage as zero or as a complete total', async () => {
  request.mockResolvedValue({ storage: { ...storage, complete: false, known_used_bytes: null } });
  mount();
  await screen.findByText('com_codechat_space_partial: — / 1.0 GiB');
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
});
