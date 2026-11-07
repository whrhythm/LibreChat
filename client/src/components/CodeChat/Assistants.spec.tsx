import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { aiProjects, createAIProject, resumeAIProject } from 'librechat-data-provider';
import Assistants from './Assistants';
jest.mock('./Knowledge', () => () => <div>Project knowledge</div>);

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'test' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  aiProjects: jest.fn(),
  createAIProject: jest.fn(),
  resumeAIProject: jest.fn(),
}));
function mount() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
      >
        <Assistants enabled onFiles={jest.fn()} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => jest.clearAllMocks());
it('keeps the same request identity after a failed creation and does not replay automatically', async () => {
  (aiProjects as jest.Mock).mockResolvedValue({ enabled: true, projects: [] });
  (createAIProject as jest.Mock).mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({});
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'com_ai_projects_create' }));
  fireEvent.change(screen.getByLabelText('com_ai_projects_name'), { target: { value: 'Support' } });
  fireEvent.change(screen.getByLabelText('com_ai_projects_purpose'), {
    target: { value: 'Answer policy questions' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_ai_projects_create' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('com_ai_projects_recovery');
  expect(createAIProject).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('com_ai_projects_purpose')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_retry' }));
  await waitFor(() => expect(createAIProject).toHaveBeenCalledTimes(2));
  expect((createAIProject as jest.Mock).mock.calls[0]).toEqual(
    (createAIProject as jest.Mock).mock.calls[1],
  );
});
it('offers explicit recovery for a persisted unfinished project without claiming knowledge is ready', async () => {
  (aiProjects as jest.Mock).mockResolvedValue({
    enabled: true,
    projects: [
      {
        project: { id: 'project', name: 'Support', path: 'assistant-test' },
        agent_id: 'agent-test',
        state: 'preparing',
        knowledge_state: 'not_configured',
      },
    ],
  });
  (resumeAIProject as jest.Mock).mockResolvedValue({});
  mount();
  expect(await screen.findByText('com_ai_projects_knowledge_pending')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'com_ai_projects_try' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'com_ai_projects_resume' }));
  await waitFor(() => expect(resumeAIProject).toHaveBeenCalledWith('test', 'project'));
});

it('opens the native assistant entry in a fresh page so prior chat configuration cannot win', async () => {
  (aiProjects as jest.Mock).mockResolvedValue({
    enabled: true,
    projects: [
      {
        project: { id: 'project', name: 'Support', path: 'assistant-test' },
        agent_id: 'agent-test',
        state: 'ready',
        knowledge_state: 'not_configured',
      },
    ],
  });
  mount();
  expect(await screen.findByRole('link', { name: 'com_ai_projects_try' })).toHaveAttribute(
    'href',
    '/c/new?endpoint=agents&agent_id=agent-test',
  );
});
