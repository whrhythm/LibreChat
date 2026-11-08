import { createStore, Provider } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { assistantCatalog, projectReleases } from 'librechat-data-provider';
import { activePanelAtom } from '~/Providers/ActivePanelContext';
import Catalog from './Catalog';
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'member' }, token: 'test' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('~/data-provider', () => ({ useGetStartupConfig: () => ({ data: {} }) }));
jest.mock('./Releases', () => () => <div>{'owner controls'}</div>);
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  assistantCatalog: jest.fn(),
  projectReleases: jest.fn(),
}));
const item = {
  project_id: 'project',
  name: 'Published helper',
  number: 2,
  kind: 'shared',
  revision: 3,
  state: 'active',
  held_micros: 20,
  budget_micros: 100000,
};
function mount() {
  const store = createStore();
  store.set(activePanelAtom, 'assistant-catalog');
  render(
    <Provider store={store}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
      >
        <Catalog />
      </QueryClientProvider>
    </Provider>,
  );
}
beforeEach(() => jest.clearAllMocks());
it('shows shared releases without edit, delete or sharing controls and does not navigate on browsing', async () => {
  (assistantCatalog as jest.Mock).mockResolvedValue({ items: [item], invitations: [] });
  const url = window.location.href;
  mount();
  await screen.findByText(item.name);
  expect(screen.queryByText('com_sharing_manage')).not.toBeInTheDocument();
  expect(screen.queryByText('owner controls')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'com_catalog_shared' }));
  expect(window.location.href).toBe(url);
  expect(screen.getByRole('link', { name: 'com_catalog_open' })).toHaveAttribute(
    'href',
    '/application/project',
  );
});
it('requires explicit invitation acceptance and sends only the current revision', async () => {
  (assistantCatalog as jest.Mock).mockResolvedValue({
    items: [],
    invitations: [{ ...item, state: 'pending' }],
  });
  (projectReleases as jest.Mock).mockResolvedValue({ state: 'active' });
  mount();
  await screen.findByText(item.name);
  expect(screen.queryByRole('link', { name: 'com_catalog_open' })).not.toBeInTheDocument();
  expect(projectReleases).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'com_catalog_accept' }));
  await waitFor(() =>
    expect(projectReleases).toHaveBeenCalledWith('test', 'project', '/invitation', {
      expected_revision: 3,
      accept: true,
    }),
  );
});
it('keeps published owner management explicit and shows request failures', async () => {
  (assistantCatalog as jest.Mock).mockResolvedValue({
    items: [{ ...item, kind: 'mine' }],
    invitations: [],
  });
  mount();
  await screen.findByText(item.name);
  fireEvent.click(screen.getByText('com_sharing_manage'));
  expect(await screen.findByText('owner controls')).toBeVisible();
});
