import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  programmingTask,
  decideProgrammingTask,
  ProgrammingRequestError,
} from 'librechat-data-provider';
import type { ProgrammingTask } from 'librechat-data-provider';
import Task, { TaskContent } from './Task';

jest.mock('~/hooks/AuthContext', () => ({
  AuthContext: jest.requireActual<typeof import('react')>('react').createContext(undefined),
}));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock(
  '~/components/Chat/Messages/Content/MarkdownLite',
  () =>
    ({ content }: { content: string }) => <p>{content}</p>,
);
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  programmingTask: jest.fn(),
  decideProgrammingTask: jest.fn(),
  cancelProgrammingTask: jest.fn(),
}));
const id = '12345678-1234-1234-1234-123456789abc';
const initial: ProgrammingTask = {
  id,
  conversation_id: 'chat',
  config: {
    conversation_id: 'chat',
    revision: 1,
    project_path: 'demo',
    strategy: 'implement',
    approval: 'strict',
    model: 'model',
  },
  status: 'awaiting_approval',
  error_code: null,
  pending: { id, expires_at: '2099-01-01T00:00:00Z' },
  events: [
    {
      sequence: 1,
      kind: 'approval',
      operation: 'command',
      at: '2026-11-05T00:00:00Z',
      operation_id: id,
      arguments: { command: 'python test.py' },
    },
  ],
};
function mount(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <TaskContent id={id} userId="owner" token="synthetic" />
    </QueryClientProvider>,
  );
}
beforeEach(() => jest.clearAllMocks());

it('keeps one reply across approval, final result and a remount without another decision', async () => {
  let task = initial;
  (programmingTask as jest.Mock).mockImplementation(async () => task);
  (decideProgrammingTask as jest.Mock).mockImplementation(async () => {
    task = {
      ...initial,
      status: 'running',
      pending: null,
      events: [
        ...initial.events,
        {
          sequence: 2,
          kind: 'decision',
          at: '2026-11-05T00:00:01Z',
          operation_id: id,
        },
      ],
    };
    return task;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = mount(client);
  fireEvent.click(await screen.findByText('com_codechat_programming_approve'));
  await screen.findByText('com_codechat_run_running');
  expect(screen.getByText('com_codechat_task_command')).toBeVisible();
  task = {
    ...task,
    status: 'completed',
    events: [
      ...task.events,
      {
        sequence: 3,
        kind: 'finished',
        at: '2026-11-05T00:00:02Z',
        text: 'Actual completed result',
      },
    ],
  };
  await client.invalidateQueries();
  expect(await screen.findByTestId('programming-task-result')).toHaveTextContent(
    'Actual completed result',
  );
  expect(screen.getAllByTestId('programming-task')).toHaveLength(1);
  expect(decideProgrammingTask).toHaveBeenCalledTimes(1);
  view.unmount();
  const restored = mount(client);
  expect(await screen.findByTestId('programming-task-result')).toHaveTextContent(
    'Actual completed result',
  );
  expect(decideProgrammingTask).toHaveBeenCalledTimes(1);
  restored.unmount();
  client.clear();
});

it('retains last confirmed progress during a query outage and recovers without submitting work', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  (programmingTask as jest.Mock).mockResolvedValue(initial);
  const view = mount(client);
  await screen.findByText('com_codechat_run_approval');
  (programmingTask as jest.Mock).mockRejectedValue(new ProgrammingRequestError(503));
  await client.invalidateQueries();
  await waitFor(() => expect(screen.getByText('com_codechat_task_reconnecting')).toBeVisible(), {
    timeout: 4000,
  });
  expect(screen.getByText('com_codechat_run_approval')).toBeVisible();
  (programmingTask as jest.Mock).mockResolvedValue({
    ...initial,
    status: 'running',
    pending: null,
  });
  fireEvent.click(screen.getByText('com_codechat_retry'));
  await screen.findByText('com_codechat_run_running');
  expect(decideProgrammingTask).not.toHaveBeenCalled();
  view.unmount();
  client.clear();
});

it('does not query private tasks from an unauthenticated share view', () => {
  render(<Task id={id} />);
  expect(screen.getByText('com_codechat_task_private')).toBeVisible();
  expect(programmingTask).not.toHaveBeenCalled();
});
