import { libraryRequest, projectLibrary } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Knowledge from './Knowledge';
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'test' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  libraryRequest: jest.fn(),
  projectLibrary: jest.fn(),
}));
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
    >
      <Knowledge projectId="project" embedded />
    </QueryClientProvider>,
  );
}
beforeEach(() => jest.clearAllMocks());
it('binds a selected library with the last confirmed association and keeps publication separate', async () => {
  (libraryRequest as jest.Mock).mockResolvedValue({
    libraries: [
      { id: 'lib-a', name: 'A' },
      { id: 'lib-b', name: 'B' },
    ],
  });
  (projectLibrary as jest.Mock).mockResolvedValue({ library: { id: 'lib-a', name: 'A' } });
  mount();
  await screen.findByRole('option', { name: 'B' });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'lib-b' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
  await waitFor(() =>
    expect(projectLibrary).toHaveBeenCalledWith('test', 'project', {
      library_id: 'lib-b',
      expected_library_id: 'lib-a',
    }),
  );
  expect(screen.getByText('com_library_binding_hint')).toBeVisible();
});
it('does not treat an unavailable library list as empty or permit binding writes', async () => {
  (libraryRequest as jest.Mock).mockRejectedValue(new Error('knowledge_unavailable'));
  (projectLibrary as jest.Mock).mockResolvedValue({ library: null });
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('com_knowledge_error');
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.queryByText('com_library_create_hint')).not.toBeInTheDocument();
});
