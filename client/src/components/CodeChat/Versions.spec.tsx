import { versionRequest, VersionError } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Versions from './Versions';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'alice' }, token: 'synthetic-token' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  versionRequest: jest.fn(),
}));
const request = versionRequest as jest.Mock;
const history = {
  versions: [
    {
      id: 'version-one',
      path: 'project',
      name: 'Before change',
      stored_bytes: 120,
      created_at: '2026-11-06T00:00:00Z',
    },
  ],
  restores: [],
  used_bytes: 120,
  limit: 20,
  max_source_bytes: 4194304,
  excluded: ['.git', '.venv'],
};
function mount(path = 'project') {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <Versions path={path} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  request.mockReset();
  let n = 0;
  Object.defineProperty(global.crypto, 'randomUUID', {
    configurable: true,
    value: () => `test-request-${++n}-0000000000`,
  });
});
it('requires a selected folder and exposes recoverable loading/error states', async () => {
  const view = mount('');
  expect(screen.getByText('com_codechat_versions_title')).toBeDisabled();
  view.unmount();
  request.mockRejectedValue(new VersionError('versions_unavailable'));
  mount();
  fireEvent.click(screen.getByText('com_codechat_versions_title'));
  await screen.findByText('com_codechat_versions_error');
  expect(screen.getByText('com_codechat_retry')).toBeEnabled();
});
it('shows changes and creates a recovery point without changing chat or files', async () => {
  request.mockImplementation(async (_token: string, suffix: string, method = 'GET') => {
    if (suffix.endsWith('/diff'))
      return {
        changes: [{ path: 'main.py', change: 'modified', diff: '-old\n+new', truncated: false }],
        unchanged: 0,
      };
    if (method === 'POST') return { id: 'created' };
    return history;
  });
  mount();
  fireEvent.click(screen.getByText('com_codechat_versions_title'));
  await screen.findByText('Before change');
  fireEvent.click(screen.getByText('com_codechat_versions_diff'));
  await screen.findByText('-old +new', { exact: false });
  fireEvent.change(screen.getByLabelText('com_codechat_versions_name'), {
    target: { value: 'Save first' },
  });
  fireEvent.click(screen.getByText('com_codechat_versions_create'));
  await screen.findByText('com_codechat_versions_created');
  expect(request).toHaveBeenCalledWith(
    'synthetic-token',
    '',
    'POST',
    { path: 'project', name: 'Save first' },
    expect.any(String),
  );
});
it('retains restore identity after an uncertain result and offers verified retry after reload', async () => {
  let lost = false;
  request.mockImplementation(async (_token: string, suffix: string, method = 'GET') => {
    if (method === 'POST') {
      if (!lost) {
        lost = true;
        throw new VersionError('versions_restore_uncertain');
      }
      return { status: 'ready' };
    }
    return {
      ...history,
      restores: lost
        ? [
            {
              id: 'operation',
              version_id: 'version-one',
              target: 'restored',
              status: 'unknown',
              request_key: 'original-request-0001',
            },
          ]
        : [],
    };
  });
  mount();
  fireEvent.click(screen.getByText('com_codechat_versions_title'));
  await screen.findByText('Before change');
  fireEvent.click(screen.getByText('com_codechat_versions_restore'));
  fireEvent.change(screen.getByLabelText('com_codechat_versions_target'), {
    target: { value: 'restored' },
  });
  fireEvent.click(screen.getByText('com_codechat_versions_restore_confirm'));
  await screen.findByText('com_codechat_versions_verify');
  fireEvent.click(screen.getByText('com_codechat_versions_verify'));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      'synthetic-token',
      '/version-one/restore',
      'POST',
      { target: 'restored' },
      'original-request-0001',
    ),
  );
  await screen.findByText('com_codechat_versions_restored');
});
