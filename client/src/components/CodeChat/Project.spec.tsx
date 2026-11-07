import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { projectKnowledge, projectReleases, projectTrials } from 'librechat-data-provider';
import type { AIProject } from 'librechat-data-provider';
import Project from './Project';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'test' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('~/data-provider', () => ({ useGetStartupConfig: () => ({ data: { aiTrialsEnabled: true, aiReleasesEnabled: true } }) }));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  projectTrials: jest.fn(), projectReleases: jest.fn(), projectKnowledge: jest.fn(),
}));
const value: AIProject = {
  project: { id: 'project', name: 'Assistant', path: 'assistant-test', goal: 'Answer questions', revision: 1, created_at: '', updated_at: '' },
  agent_id: 'agent-test', state: 'ready', knowledge_state: 'not_configured',
};
const data = {
  config: { instructions: 'Original', model: 'test', temperature: 0, max_output_tokens: 512, response_style: 'grounded' },
  digest: 'a'.repeat(64), revision: 1, models: ['test'], output_limit: 4096, trials: [],
};
function mount() {
  const onBack = jest.fn(); const onFiles = jest.fn();
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions: {queries: { retry: false, cacheTime: 0 }}})}><Project value={value} enabled onBack={onBack} onFiles={onFiles} /></QueryClientProvider></MemoryRouter>);
  return { onBack, onFiles };
}
function section(name: string) { fireEvent.mouseDown(screen.getByRole('tab', { name }), {button: 0, ctrlKey: false}); }
beforeEach(() => {
  jest.clearAllMocks();
  (projectTrials as jest.Mock).mockResolvedValue(data);
  (projectReleases as jest.Mock).mockResolvedValue({ application: null, releases: [], members: [] });
  (projectKnowledge as jest.Mock).mockResolvedValue({ revisions: [], limits: { files: 10, file_bytes: 1048576 } });
});
it('opens one task at a time and keeps unsaved settings while browsing materials', async () => {
  const { onFiles, onBack } = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'com_trials_edit' }));
  fireEvent.change(screen.getByLabelText('com_trials_instructions'), {target: {value: 'Unsaved edit'}});
  section('com_project_materials');
  expect(await screen.findByText('com_knowledge_empty')).toBeVisible();
  expect(screen.getByLabelText('com_trials_instructions')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_project_files' }));
  expect(onFiles).toHaveBeenCalledWith('assistant-test');
  section('com_project_settings');
  expect(screen.getByLabelText('com_trials_instructions')).toHaveValue('Unsaved edit');
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'com_project_back' }));
  expect(onBack).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'com_project_back' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  confirm.mockRestore();
  expect((projectTrials as jest.Mock).mock.calls.every((args) => !args[3])).toBe(true);
});
it('does not require knowledge or code and prevents publication before trial acceptance', async () => {
  mount();
  expect(await screen.findByRole('button', {name: 'com_trials_create'})).toBeEnabled();
  expect(projectKnowledge).not.toHaveBeenCalled();
  section('com_project_publish');
  expect(await screen.findByText('com_releases_test_first')).toBeVisible();
  expect(screen.getByRole('button', {name: 'com_releases_publish'})).toBeDisabled();
});
it('distinguishes unpublished edits from the actual active version', async () => {
  (projectReleases as jest.Mock).mockResolvedValue({ application: { active_release_id: 'release', enabled: true, budget_micros: 500000, held_micros: 0 }, releases: [{id: 'release', number: 3, digest: 'b'.repeat(64)}], members: [] });
  mount();
  await waitFor(() => expect(screen.getByText('com_project_draft')).toBeVisible());
  expect(screen.queryByText('com_project_same')).not.toBeInTheDocument();
});
