import { projectKnowledge } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Knowledge from './Knowledge';
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'test' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  projectKnowledge: jest.fn(),
}));
const failed = {
  id: 'revision',
  state: 'failed',
  manifest: [{ name: 'policy.md', bytes: 12 }],
  source_bytes: 12,
  index_bytes: 2048,
  created_at: '2026-11-07T00:00:00Z',
};
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
    >
      <Knowledge projectId="project" />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText('com_knowledge_title'));
}
beforeEach(() => jest.clearAllMocks());
it('shows index failure and explicitly retries the same revision, not a new upload', async () => {
  (projectKnowledge as jest.Mock).mockResolvedValue({
    revisions: [failed],
    active_revision_id: null,
    limits: { files: 10, file_bytes: 1048576 },
  });
  mount();
  expect(await screen.findByText('com_knowledge_failed')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_retry' }));
  await waitFor(() =>
    expect(projectKnowledge).toHaveBeenCalledWith('test', 'project', '/revision/retry', {}),
  );
});
it('does not confuse an unavailable list with an empty knowledge base', async () => {
  (projectKnowledge as jest.Mock).mockRejectedValue(new Error('knowledge_unavailable'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('com_knowledge_error');
  expect(screen.queryByText('com_knowledge_empty')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'com_knowledge_import' })).toBeDisabled();
});
