import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  workspaceProjects,
  workspaceProject,
  workspaceProjectSource,
  saveWorkspaceProject,
  ProjectRequestError,
} from 'librechat-data-provider';
import Projects from './Projects';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'project-owner' }, token: 'test-token' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('./Delivery', () => () => null);
jest.mock('./Templates', () => ({ TemplateCreate: () => null, TemplateProject: () => null }));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  workspaceProjects: jest.fn(),
  workspaceProject: jest.fn(),
  workspaceProjectSource: jest.fn(),
  saveWorkspaceProject: jest.fn(),
}));
const project = {
  id: '11111111-1111-4111-8111-111111111111',
  path: 'old/folder',
  name: 'Test project',
  goal: 'Keep existing files',
  revision: 1,
};
const detail = {
  ...project,
  application: null,
  tasks_truncated: false,
  tasks: [
    {
      id: 'task',
      conversation_id: '22222222-2222-4222-8222-222222222222',
      title: 'Existing request',
      status: 'completed',
      created_at: '2026-11-06T00:00:00Z',
      acceptance: { total: 1, passed: 0, pending: 1, changes_requested: 0, revision: 1 },
    },
  ],
};
function show() {
  const onOpen = jest.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <Projects enabled path="old/folder" onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return onOpen;
}
beforeEach(() => {
  jest.clearAllMocks();
  (workspaceProjects as jest.Mock).mockResolvedValue({ projects: [project] });
  (workspaceProject as jest.Mock).mockResolvedValue(detail);
});
it('loads existing context without selecting a chat or moving files; opens the exact nested directory', async () => {
  const onOpen = show();
  await screen.findByText('Keep existing files');
  expect(screen.getByText('com_codechat_project_unchecked')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'com_codechat_project_continue' })).toHaveAttribute(
    'href',
    '/c/' + detail.tasks[0].conversation_id,
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_project_files' }));
  expect(onOpen).toHaveBeenLastCalledWith('files', 'old/folder');
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_project_apps' }));
  expect(onOpen).toHaveBeenLastCalledWith('apps', 'old/folder');
  expect(saveWorkspaceProject).not.toHaveBeenCalled();
  expect(workspaceProjectSource).not.toHaveBeenCalled();
});
it('retains metadata draft on conflict and does not retry a write automatically', async () => {
  (saveWorkspaceProject as jest.Mock).mockRejectedValue(
    new ProjectRequestError('projects_changed'),
  );
  show();
  await screen.findByText('Keep existing files');
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_project_edit' }));
  fireEvent.change(screen.getByLabelText('com_codechat_project_goal'), {
    target: { value: 'New goal' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
  await screen.findByText('com_codechat_project_conflict');
  expect(screen.getByLabelText('com_codechat_project_goal')).toHaveValue('New goal');
  expect(saveWorkspaceProject).toHaveBeenCalledTimes(1);
});
it('saves a folder association once and reads its persistent context', async () => {
  (workspaceProjects as jest.Mock).mockResolvedValue({ projects: [] });
  (saveWorkspaceProject as jest.Mock).mockImplementation(async () => {
    (workspaceProjects as jest.Mock).mockResolvedValue({ projects: [project] });
    return project;
  });
  show();
  await screen.findByText('com_codechat_projects_empty');
  fireEvent.click(screen.getAllByRole('button', { name: 'com_codechat_project_associate' })[1]);
  expect(screen.getByLabelText('com_codechat_project_path')).toHaveValue('old/folder');
  fireEvent.change(screen.getByLabelText('com_codechat_project_name'), {
    target: { value: 'Test project' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
  await screen.findByText('Keep existing files');
  expect(saveWorkspaceProject).toHaveBeenCalledWith('test-token', {
    path: 'old/folder',
    name: 'Test project',
    goal: '',
    revision: 0,
  });
});
it('reports a failed file comparison without clearing readable project context', async () => {
  (workspaceProjectSource as jest.Mock).mockRejectedValue(
    new ProjectRequestError('projects_source_unavailable'),
  );
  show();
  await screen.findByText('Keep existing files');
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_project_check' }));
  await screen.findByText('com_codechat_project_check_error');
  expect(screen.getByText('Existing request')).toBeInTheDocument();
});
it('does not show an empty project list when the service fails', async () => {
  (workspaceProjects as jest.Mock).mockRejectedValue(new Error('unavailable'));
  show();
  await screen.findByRole('alert');
  expect(screen.queryByText('com_codechat_projects_empty')).not.toBeInTheDocument();
  (workspaceProjects as jest.Mock).mockResolvedValue({ projects: [project] });
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_retry' }));
  await waitFor(() => expect(screen.getByText('Keep existing files')).toBeInTheDocument());
});
