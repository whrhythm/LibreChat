import { libraryRequest } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Library from './Library';
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'test' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  libraryRequest: jest.fn(),
}));
const row = {
  id: 'library',
  name: 'Policies',
  head_revision_id: 'new',
  active_revision_id: 'old',
  head: {
    id: 'new',
    state: 'failed',
    source_bytes: 10,
    index_bytes: 20,
    manifest: [{ name: 'policy.md', bytes: 10 }],
  },
  revisions: [],
  references: { projects: [], fixed_trials: 0 },
  limits: { files: 10, file_bytes: 1048576, revisions: 20 },
};
it('exposes failed file status, retains the known active revision and retries the same head', async () => {
  (libraryRequest as jest.Mock).mockResolvedValue(row);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
    >
      <Library id="library" onClose={jest.fn()} onDirty={jest.fn()} />
    </QueryClientProvider>,
  );
  await screen.findByText('policy.md');
  expect(screen.getByText('com_library_previous_active')).toBeVisible();
  expect(screen.getByRole('button', { name: 'com_library_preview policy.md' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));
  await waitFor(() => expect(libraryRequest).toHaveBeenCalledWith('test', '/library/retry', {}));
});
