import { Provider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  aiProjects,
  workspaceProject,
  personalCapacityRequest,
  projectTrials,
  projectReleases,
} from 'librechat-data-provider';
import { projectInspector } from './navigation';
import Inspector from './Inspector';

const mockNative = {
  _id: 'native-project',
  name: 'Team assistant',
  platformProjectId: 'platform-project',
};
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'synthetic' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('~/data-provider', () => ({
  useProjectQuery: () => ({ data: mockNative, isSuccess: true, refetch: jest.fn() }),
  useGetStartupConfig: () => ({ data: { aiTrialsEnabled: true, aiReleasesEnabled: true } }),
}));
jest.mock('~/components/CodeChat/config', () => ({ isCodeChatEnabled: () => true }));
jest.mock('~/components/CodeChat/CodeEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  aiProjects: jest.fn(),
  workspaceProject: jest.fn(),
  personalCapacityRequest: jest.fn(),
  projectTrials: jest.fn(),
  projectReleases: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (aiProjects as jest.Mock).mockResolvedValue({
    projects: [{ project: { id: 'platform-project', path: 'team', name: 'Team' }, state: 'ready' }],
  });
  (workspaceProject as jest.Mock).mockResolvedValue({ path: 'team', tasks: [], application: null });
  (personalCapacityRequest as jest.Mock).mockResolvedValue({
    storage: { budget_bytes: 4096, known_used_bytes: 1024, complete: true, components: [] },
    applications: { used: 0, limit: 3 },
    wallet: { status: 'ok', spent_usd_micros: 0, allocated_usd_micros: 1000000 },
  });
  (projectTrials as jest.Mock).mockResolvedValue({
    digest: 'current',
    trials: [{ id: 'trial', state: 'ready', digest: 'current', agent_id: 'agent_trial' }],
    config: null,
    models: [],
  });
  (projectReleases as jest.Mock).mockResolvedValue({ application: null, releases: [] });
});

function mount() {
  const store = createStore();
  store.set(projectInspector('owner'), { projectId: 'native-project', section: 'assistant' });
  render(
    <Provider store={store}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
      >
        <MemoryRouter initialEntries={['/c/existing']}>
          <textarea aria-label="chat draft" defaultValue="Keep this unsent request" />
          <Inspector />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  return store;
}

it('shows a versioned trial frame and capability authorization while preserving the draft', async () => {
  const store = mount();
  const trial = await screen.findByRole('link', { name: /com_project_trial_new_tab/ });
  expect(trial).toHaveAttribute('target', '_blank');
  expect(trial).toHaveAttribute(
    'href',
    '/c/new?endpoint=agents&agent_id=agent_trial&projectId=native-project',
  );
  expect(screen.getByTitle('com_project_trial_frame')).toHaveAttribute(
    'src',
    '/c/new?endpoint=agents&agent_id=agent_trial&projectId=native-project&trialPane=1',
  );
  const frame = screen.getByTitle('com_project_trial_frame');
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'com_project_capabilities' }), { button: 0 });
  expect(screen.getByText('com_project_mcp_missing')).toBeVisible();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'com_project_try_pane' }), { button: 0 });
  expect(screen.getByTitle('com_project_trial_frame')).toBe(frame);
  expect(screen.getByLabelText('chat draft')).toHaveValue('Keep this unsent request');
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));
  expect(store.get(projectInspector('owner'))).toBeNull();
  expect(store.get(projectInspector('different-owner'))).toBeNull();
  expect(screen.getByLabelText('chat draft')).toHaveValue('Keep this unsent request');
});

it('opens publishing from the header and returns without replacing the chat', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'com_project_publish' }));
  expect(await screen.findByRole('region', { name: 'com_releases_title' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'com_project_back_to_workbench' }));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'com_releases_title' })).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText('chat draft')).toHaveValue('Keep this unsent request');
});

it('does not report missing resources when the service failed and can retry', async () => {
  (workspaceProject as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('com_project_status_error');
  expect(screen.queryByText('com_project_no_assistant')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));
  expect(await screen.findByRole('link', { name: /com_project_trial_new_tab/ })).toBeVisible();
});
