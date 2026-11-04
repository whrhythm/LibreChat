import { personalApplicationRequest } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Applications from './Applications';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'alice' }, token: 'synthetic-token' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  personalApplicationRequest: jest.fn(),
}));
const request = personalApplicationRequest as jest.MockedFunction<
  typeof personalApplicationRequest
>;

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Applications path="demo" canPublish enabled />
    </QueryClientProvider>,
  );
}

describe('applications in the personal space sidebar', () => {
  beforeEach(() => request.mockReset());

  it.each([
    ['build_failed', 'com_codechat_app_build_failed'],
    ['build_storage_exhausted', 'com_codechat_app_build_storage'],
    ['build_memory_exhausted', 'com_codechat_app_build_memory'],
    ['build_timed_out', 'com_codechat_app_build_timeout'],
  ])(
    'explains %s and waits for an explicit retry instead of publishing automatically',
    async (code, message) => {
      request.mockResolvedValue({
        json: async () => ({
          apps: [
            {
              id: 'failed',
              project_path: 'demo',
              status: 'failed',
              desired_state: 'running',
              error_code: code,
              image: null,
              url: null,
              observation: null,
              cleanup: { status: 'complete' },
            },
          ],
        }),
      } as Response);
      mount();
      await screen.findByText(message);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(request.mock.calls.filter((call) => call[1] === 'publish')).toHaveLength(0);
      fireEvent.click(screen.getByRole('button', { name: 'com_codechat_app_retry_publish' }));
      await waitFor(() =>
        expect(request).toHaveBeenCalledWith('synthetic-token', 'publish', 'demo'),
      );
    },
  );

  it('submits publication for the currently open directory', async () => {
    request.mockResolvedValue({ json: async () => ({ apps: [] }) } as Response);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'com_codechat_app_publish' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('synthetic-token', 'publish', 'demo'));
  });

  it('shows a real application address and asks before removing runtime resources', async () => {
    request.mockResolvedValue({
      json: async () => ({
        apps: [
          {
            id: 'app-identifier',
            project_path: 'demo',
            status: 'running',
            desired_state: 'running',
            image: 'registry/project/app@sha256:digest',
            url: 'https://chat.test/apps/demo/',
            observation: { logs: 'ready', metrics: null },
            database: { used_bytes: 50, reserved_bytes: 100, observed_at: null },
          },
        ],
      }),
    } as Response);
    mount();
    expect(await screen.findByRole('link', { name: 'com_codechat_app_open' })).toHaveAttribute(
      'href',
      'https://chat.test/apps/demo/',
    );
    expect(screen.queryByText('com_codechat_db_engine')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_codechat_app_actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'com_codechat_app_remove' }));
    expect(request).not.toHaveBeenCalledWith('synthetic-token', 'delete', 'app-identifier');
    expect(screen.getByText('com_codechat_app_delete_notice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_codechat_app_delete_confirm' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('synthetic-token', 'delete', 'app-identifier'),
    );
  });

  it('blocks duplicate publication while a build is active and displays a stop action only for a built image', async () => {
    request.mockResolvedValue({
      json: async () => ({
        apps: [
          {
            id: 'pending',
            project_path: 'demo',
            status: 'building',
            desired_state: 'running',
            image: null,
            url: null,
            observation: null,
          },
        ],
      }),
    } as Response);
    mount();
    await screen.findByText('com_codechat_app_building');
    expect(screen.getByRole('button', { name: 'com_codechat_app_publish' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'com_codechat_app_stop' })).not.toBeInTheDocument();
  });
});
