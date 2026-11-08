import { Provider, createStore } from 'jotai';
import { personalCapacityRequest } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CapacityAccount } from 'librechat-data-provider';
import { activePanelAtom } from '~/Providers/ActivePanelContext';
import Usage, { usageRatios } from './Usage';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'usage-owner' }, token: 'synthetic' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('~/data-provider', () => ({ useGetStartupConfig: () => ({ data: {} }) }));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  personalCapacityRequest: jest.fn(),
}));
const request = personalCapacityRequest as jest.Mock;
function fixture(): CapacityAccount {
  return {
    storage: {
      known_used_bytes: 1024,
      budget_bytes: 4096,
      pending_capacity_bytes: 0,
      complete: true,
      components: [],
    },
    plan: {
      id: 'trial',
      version: 'v1',
      name: 'Trial',
      storage_gib: 4,
      application_limit: 5,
      amount_minor: 0,
      currency: 'CNY',
    },
    mode: 'test',
    plans: [],
    active_order: null,
    orders: [],
    wallet: {
      status: 'ok',
      spent_usd_micros: 500000,
      allocated_usd_micros: 1000000,
      total_tokens: 1234,
    },
    applications: { used: 2, limit: 5 },
  };
}
it('uses dollar credit rather than token estimates, and does not invent missing totals', () => {
  expect(usageRatios(fixture())).toEqual({ storage: 0.25, model: 0.5 });
  expect(usageRatios()).toEqual({ storage: null, model: null });
  const data = fixture();
  data.wallet!.status = 'unknown';
  data.storage.budget_bytes = 0;
  expect(usageRatios(data)).toEqual({ storage: null, model: null });
});
it('keeps confirmed readings when refresh fails and recovers on explicit retry without changing chat', async () => {
  request
    .mockResolvedValueOnce(fixture())
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(fixture());
  const store = createStore();
  store.set(activePanelAtom, 'resource-usage');
  render(
    <Provider store={store}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
      >
        <textarea aria-label="draft" defaultValue="keep me" />
        <Usage />
      </QueryClientProvider>
    </Provider>,
  );
  await screen.findByText('$0.50 / $1.00');
  expect(screen.getByText('1,234')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'com_assets_refresh' }));
  await screen.findByRole('alert');
  expect(screen.getByText('$0.50 / $1.00')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'com_assets_refresh' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByLabelText('draft')).toHaveValue('keep me');
});
