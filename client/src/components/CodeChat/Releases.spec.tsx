import { projectReleases, projectTrials } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Releases from './Releases';
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'test' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  projectReleases: jest.fn(),
  projectTrials: jest.fn(),
}));
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
    >
      <Releases projectId="project" />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_releases_title' }));
}
beforeEach(() => jest.clearAllMocks());
it('requires accepted current evidence and explicit creator payment confirmation', async () => {
  (projectReleases as jest.Mock).mockResolvedValue({
    application: null,
    releases: [],
    members: [],
  });
  (projectTrials as jest.Mock).mockResolvedValue({ trials: [] });
  mount();
  expect(await screen.findByText('com_releases_test_first')).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'com_releases_publish' })).toBeDisabled();
});
it('reuses publication intent after unknown response and never publishes during refresh', async () => {
  (projectTrials as jest.Mock).mockResolvedValue({
    trials: [{ id: 'trial', digest: 'a'.repeat(64), number: 1, acceptance_valid: true }],
  });
  (projectReleases as jest.Mock).mockImplementation((_t, _p, _suffix, body) =>
    body
      ? Promise.reject(new Error('timeout'))
      : Promise.resolve({ application: null, releases: [], members: [] }),
  );
  mount();
  await screen.findByText('com_releases_ready 1');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'com_releases_publish' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'com_releases_refresh' }));
  expect((projectReleases as jest.Mock).mock.calls.filter((c) => c[3])).toHaveLength(1);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'com_releases_publish' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_releases_publish' }));
  await waitFor(() =>
    expect((projectReleases as jest.Mock).mock.calls.filter((c) => c[3])).toHaveLength(2),
  );
  const calls = (projectReleases as jest.Mock).mock.calls.filter((c) => c[3]);
  expect(calls[1][3]).toEqual(calls[0][3]);
  expect(calls[0][3].confirm_sponsor).toBe(true);
});
