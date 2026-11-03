import { randomUUID } from 'node:crypto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { personalCapacityRequest, QueryKeys } from 'librechat-data-provider';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CapacityAccount, CapacityOrder } from 'librechat-data-provider';
import Capacity from './Capacity';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'alice' }, token: 'synthetic' }),
  useLocalize: () => (key: string, values?: { capacity?: number }) =>
    values?.capacity ? `${key}:${values.capacity}` : key,
}));
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { codechat: { capacity: { enabled: true } } } }),
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  personalCapacityRequest: jest.fn(),
}));
const request = personalCapacityRequest as jest.Mock;
const basic = {
  id: 'basic',
  version: 'test-v1',
  name: 'Basic',
  storage_gib: 4,
  application_limit: 5,
  amount_minor: 1000,
  currency: 'CNY',
};
function account(): CapacityAccount {
  return {
    plan: { ...basic, id: 'existing', storage_gib: 2, application_limit: 3 },
    mode: 'test',
    plans: [basic],
    active_order: null,
    orders: [],
    applications: { used: 1, limit: 3 },
    storage: {
      budget_bytes: 2147483648,
      pending_capacity_bytes: 0,
      known_used_bytes: null,
      complete: false,
      components: [
        {
          component: 'files',
          status: 'unknown',
          used_bytes: null,
          budget_bytes: 2147483648,
          observed_at: null,
        },
        {
          component: 'database',
          status: 'not_metered',
          used_bytes: null,
          budget_bytes: null,
          observed_at: null,
        },
      ],
    },
  };
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Capacity expanded />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  request.mockReset();
  Object.defineProperty(global.crypto, 'randomUUID', { value: randomUUID, configurable: true });
});

it('shows unknown usage explicitly and keeps the old plan after test payment until opening completes', async () => {
  let current = account();
  request.mockImplementation(async (_token, action) => {
    if (action === 'account') return current;
    const order: CapacityOrder = {
      id: 'test-order',
      plan: basic,
      status: action === 'order' ? 'pending_payment' : 'applying',
      payment_status: action === 'order' ? 'unpaid' : 'confirmed',
      stage: 'checking_storage',
      error_code: null,
      attempt: action === 'order' ? 0 : 1,
      created_at: '2026-11-03T00:00:00Z',
    };
    current = { ...current, active_order: order, orders: [order] };
    return order;
  });
  const client = mount();
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_capacity_title' }));
  await screen.findByText('com_codechat_capacity_partial');
  expect(screen.getAllByText(/com_codechat_capacity_unmetered/)).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_capacity_choose' }));
  await screen.findByText('com_codechat_capacity_pending');
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_capacity_confirm' }));
  await screen.findByText('com_codechat_capacity_applying');
  expect(screen.getByText('com_codechat_capacity_rights:2')).toBeVisible();
  expect(current.plan.storage_gib).toBe(2);
  expect(request).toHaveBeenCalledWith(
    'synthetic',
    'order',
    expect.objectContaining({ plan: basic, idempotencyKey: expect.any(String) }),
  );
  expect(request).toHaveBeenCalledWith(
    'synthetic',
    'confirm-test',
    expect.objectContaining({ orderId: 'test-order' }),
  );
  current = {
    ...current,
    plan: basic,
    applications: { used: 1, limit: 5 },
    active_order: null,
    orders: current.orders.map((order) => ({ ...order, status: 'ready' })),
    plans: [],
  };
  await act(async () => {
    await client.invalidateQueries([QueryKeys.codechatCapacity, 'alice']);
  });
  await screen.findByText('com_codechat_capacity_ready');
  expect(screen.getByText('com_codechat_capacity_rights:4')).toBeVisible();
});

it('lets the user retry a failed paid order without creating another order or hiding the failure', async () => {
  const current = account();
  current.active_order = {
    id: 'failed-order',
    plan: basic,
    status: 'failed',
    payment_status: 'confirmed',
    stage: 'failed',
    error_code: 'capacity_expand_timeout',
    attempt: 1,
    created_at: '2026-11-03T00:00:00Z',
  };
  request.mockImplementation(async (_token, action) =>
    action === 'account' ? current : current.active_order,
  );
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_capacity_title' }));
  await screen.findByText('com_codechat_capacity_failure_detail');
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_capacity_retry' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      'synthetic',
      'retry',
      expect.objectContaining({ orderId: 'failed-order' }),
    ),
  );
  expect(
    screen.queryByRole('button', { name: 'com_codechat_capacity_choose' }),
  ).not.toBeInTheDocument();
});
