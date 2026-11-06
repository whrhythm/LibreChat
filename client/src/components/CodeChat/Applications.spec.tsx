import { personalApplicationRequest } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { PersonalApplication } from 'librechat-data-provider';
import { canRepublish, deliveryAddress, deliveryState } from './delivery';
import Applications from './Applications';
import Delivery from './Delivery';

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
      expect(request.mock.calls.filter((call) => call[1] === 'publish')).toHaveLength(0);
      fireEvent.click(screen.getByRole('button', { name: 'com_codechat_publication_confirm' }));
      await waitFor(() =>
        expect(request).toHaveBeenCalledWith('synthetic-token', 'publish', 'demo'),
      );
    },
  );

  it('submits publication for the currently open directory', async () => {
    request.mockResolvedValue({ json: async () => ({ apps: [] }) } as Response);
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'com_codechat_app_publish' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_codechat_app_publish' }));
    await screen.findByRole('dialog');
    expect(request).not.toHaveBeenCalledWith('synthetic-token', 'publish', 'demo');
    fireEvent.click(screen.getByRole('button', { name: 'com_codechat_publication_confirm' }));
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
    expect(screen.getByRole('region', { name: 'com_codechat_app_database_usage' })).toBeVisible();
    expect(screen.getByText('com_codechat_app_database_metric')).toBeVisible();
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

const running: PersonalApplication = {
  id: 'app',
  project_path: 'demo',
  status: 'running',
  desired_state: 'running',
  image: 'registry/internal/private@sha256:digest',
  url: 'https://app.test/',
  error_code: null,
  observation: null,
};

it('cancels publication without creating a task', async () => {
  request.mockResolvedValue({ json: async () => ({ apps: [] }) } as Response);
  mount();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'com_codechat_app_publish' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_app_publish' }));
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_cancel' }));
  expect(request.mock.calls.filter((call) => call[1] === 'publish')).toHaveLength(0);
});

it('confirms the selected application rather than the open file directory', async () => {
  request.mockResolvedValue({
    json: async () => ({ apps: [{ ...running, project_path: 'another' }] }),
  } as Response);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'com_codechat_app_update' }));
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_publication_confirm' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('synthetic-token', 'publish', 'another'),
  );
  expect(request).not.toHaveBeenCalledWith('synthetic-token', 'publish', 'demo');
});

it('does not automatically resubmit a publication after its response fails', async () => {
  request.mockImplementation(async (_token, action) => {
    if (action === 'publish') throw new Error('response lost');
    return { json: async () => ({ apps: [] }) } as Response;
  });
  mount();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'com_codechat_app_publish' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_app_publish' }));
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_publication_confirm' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'com_codechat_publication_confirm' })).toBeDisabled(),
  );
  expect(request.mock.calls.filter((call) => call[1] === 'publish')).toHaveLength(1);
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(
    'com_codechat_app_error',
  );
});

it('separates uncertain outcomes from a failed deployment and offers no stale delivery link', async () => {
  request.mockResolvedValue({
    json: async () => ({
      apps: [
        {
          ...running,
          status: 'failed',
          error_code: 'kubernetes_write_requires_review',
          previous_url: running.url,
          cleanup: { status: 'complete', runtime: 'previous_release' },
        },
      ],
    }),
  } as Response);
  mount();
  await screen.findByText('com_codechat_delivery_review_short');
  expect(screen.getByRole('button', { name: 'com_codechat_app_retry_publish' })).toBeDisabled();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

it('copies only a delivery summary and never reports business acceptance as passed', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(
    <Delivery
      app={{ ...running, observation: { observed_at: '', logs: 'private-log', metrics: null } }}
      stale={false}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_delivery_title' }));
  expect(screen.getByText('com_codechat_delivery_business')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_delivery_copy' }));
  await screen.findByText('com_codechat_delivery_copied');
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText.mock.calls[0][0]).not.toMatch(/private-log|registry\/internal/);
  expect(writeText.mock.calls[0][0]).toContain('com_codechat_delivery_business');
});

it('keeps manual copying available when browser clipboard permission is unavailable', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  render(<Delivery app={running} stale />);
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_delivery_title' }));
  expect(screen.getByRole('alert')).toHaveTextContent('com_codechat_delivery_stale');
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_delivery_copy' }));
  await screen.findByText('com_codechat_delivery_copy_failed');
  expect(screen.getByText('com_codechat_delivery_copy_preview')).toBeInTheDocument();
});

it('only shares previous releases after confirmed recovery, and rejects unsafe URLs', () => {
  const failed: PersonalApplication = { ...running, status: 'failed', previous_url: running.url };
  expect(deliveryAddress(failed)).toBeNull();
  expect(canRepublish(failed)).toBe(false);
  const recovered: PersonalApplication = {
    ...failed,
    cleanup: { status: 'complete', runtime: 'previous_release' },
  };
  expect(deliveryAddress(recovered)).toBe(running.url);
  expect(deliveryState(recovered)).toBe('com_codechat_delivery_previous');
  expect(deliveryAddress({ ...running, status: 'building' })).toBeNull();
  expect(deliveryAddress({ ...running, url: 'javascript:alert(1)' })).toBeNull();
  expect(deliveryAddress({ ...running, url: 'https://user:secret@app.test/' })).toBeNull();
});
