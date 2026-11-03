import { projectDatabaseRequest } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Databases from './Databases';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'alice' }, token: 'synthetic' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  projectDatabaseRequest: jest.fn(),
  personalFileRequest: jest.fn(async () => ({
    json: async () => ({ entries: [{ name: 'demo', kind: 'directory' }] }),
  })),
}));
const request = projectDatabaseRequest as jest.Mock;
function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Databases enabled path="demo" onPathChange={jest.fn()} />
    </QueryClientProvider>,
  );
}
const base = {
  enabled: true,
  budget_bytes: 268435456,
  reserved_bytes: 0,
  reservation_bytes: 134217728,
  limit: 2,
  quota_mode: 'allocation_and_warning',
  databases: [],
};

it('requests a database from the selected project through the UI', async () => {
  request.mockImplementation(async (_token, action) =>
    action === 'list' ? base : { id: 'db-id', project_path: 'demo', status: 'requested' },
  );
  renderPanel();
  fireEvent.click(await screen.findByRole('button', { name: 'com_codechat_db_create' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      'synthetic',
      'create',
      expect.objectContaining({ path: 'demo' }),
    ),
  );
});
it('requires the exact directory before requesting permanent deletion', async () => {
  request.mockImplementation(async (_token, action) =>
    action === 'list'
      ? {
          ...base,
          reserved_bytes: 134217728,
          databases: [
            {
              id: 'db-id',
              project_path: 'demo',
              status: 'ready',
              error_code: null,
              used_bytes: 10485760,
              reserved_bytes: 134217728,
              observed_at: new Date().toISOString(),
            },
          ],
        }
      : { id: 'db-id', status: 'deleting' },
  );
  renderPanel();
  fireEvent.click(await screen.findByRole('button', { name: 'com_codechat_db_delete' }));
  const confirm = screen.getByRole('button', { name: 'com_codechat_db_confirm_delete' });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText('com_codechat_db_confirmation'), {
    target: { value: 'demo' },
  });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      'synthetic',
      'delete',
      expect.objectContaining({ id: 'db-id', confirmation: 'demo' }),
    ),
  );
});
