import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  programmingTask,
  decideProgrammingTask,
  ProgrammingRequestError,
  streamProgrammingTask,
} from 'librechat-data-provider';
import type { ProgrammingTask } from 'librechat-data-provider';
import Task, { TaskContent } from './Task';
import { newestTask } from './TaskLive';

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
  streamProgrammingTask: jest.fn(async () => {}),
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
    mcp_servers: [],
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

it('renders growing answers and live command output before completion, then one final answer', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const task = {
    ...initial,
    status: 'running',
    pending: null,
    events: [],
    updated_at: '2026-11-05T09:00:00Z',
  };
  (programmingTask as jest.Mock).mockResolvedValue(task);
  const view = mount(client);
  await screen.findByText('com_codechat_run_running');
  const update = (streamProgrammingTask as jest.Mock).mock.calls[0][3];
  const partial = {
    ...task,
    updated_at: '2026-11-05T09:00:01Z',
    events: [
      { sequence: 1, kind: 'assistant', at: task.updated_at, text: 'First part' },
      {
        sequence: 2,
        kind: 'command_progress',
        at: task.updated_at,
        stream_id: 'command',
        phase: 'running',
        output: 'step 1',
      },
    ],
  };
  act(() => update(partial));
  expect(await screen.findByTestId('programming-task-stream')).toHaveTextContent('First part');
  expect(screen.getByTestId('programming-live-command')).toHaveTextContent('step 1');
  expect(screen.getByTestId('programming-live-command')).not.toHaveAttribute('open');
  act(() =>
    update({
      ...partial,
      updated_at: '2026-11-05T09:00:02Z',
      events: [{ ...partial.events[0], text: 'First part and second part' }, partial.events[1]],
    }),
  );
  await waitFor(() =>
    expect(screen.getByTestId('programming-task-stream')).toHaveTextContent('second part'),
  );
  act(() =>
    update({
      ...partial,
      status: 'completed',
      updated_at: '2026-11-05T09:00:03Z',
      events: [
        ...partial.events,
        { sequence: 3, kind: 'finished', at: task.updated_at, text: 'Complete answer' },
      ],
    }),
  );
  expect(await screen.findByTestId('programming-task-result')).toHaveTextContent('Complete answer');
  expect(screen.queryByTestId('programming-task-stream')).not.toBeInTheDocument();
  expect(screen.queryByTestId('programming-live-command')).not.toBeInTheDocument();
  view.unmount();
  client.clear();
});

it('keeps partial text and a clear outcome after cancellation, with no active indicator', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  (programmingTask as jest.Mock).mockResolvedValue({
    ...initial,
    status: 'cancelled',
    pending: null,
    events: [
      { sequence: 1, kind: 'assistant', at: '2026-11-05T09:00:00Z', text: 'The file was saved.' },
      { sequence: 2, kind: 'finished', at: '2026-11-05T09:00:01Z', text: 'Execution stopped.' },
    ],
  });
  const view = mount(client);
  expect(await screen.findByTestId('programming-task-result')).toHaveTextContent(
    'Execution stopped.',
  );
  expect(screen.getByTestId('programming-task-update')).toHaveTextContent('The file was saved.');
  expect(screen.getByText('com_codechat_answer_partial')).toBeVisible();
  expect(screen.queryByTestId('programming-activity')).not.toBeInTheDocument();
  view.unmount();
  client.clear();
});

it('never overwrites a newer stream snapshot with a delayed older query', () => {
  const current = { ...initial, updated_at: '2026-11-05T09:00:02Z' };
  expect(newestTask(current, { ...initial, updated_at: '2026-11-05T09:00:01Z' })).toBe(current);
});

it('shows live model activity after text, preserves earlier updates, and explains silence', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const at = new Date(Date.now() - 60000).toISOString();
  const task = {
    ...initial,
    status: 'running',
    pending: null,
    events: [
      { sequence: 1, kind: 'queued', at },
      { sequence: 2, kind: 'assistant', at, text: 'I will make a playable first version.' },
      { sequence: 3, kind: 'model_progress', at, phase: 'thinking', characters: 0 },
    ],
  };
  (programmingTask as jest.Mock).mockResolvedValue(task);
  const view = mount(client);
  expect(await screen.findByText('com_codechat_activity_thinking')).toBeVisible();
  expect(screen.getByTestId('programming-quiet')).toBeVisible();
  expect(screen.getByTestId('programming-task-stream')).toHaveTextContent('playable first version');
  const update = (streamProgrammingTask as jest.Mock).mock.calls[0][3];
  act(() =>
    update({
      ...task,
      events: [
        ...task.events.slice(0, 2),
        {
          ...task.events[2],
          at: new Date().toISOString(),
          phase: 'preparing_action',
          characters: 800,
        },
        { sequence: 4, kind: 'assistant', at, text: 'The first file is ready.' },
      ],
    }),
  );
  expect(await screen.findByText('com_codechat_activity_generating')).toBeVisible();
  expect(screen.getByTestId('programming-task-update')).toHaveTextContent('playable first version');
  expect(screen.getByTestId('programming-task-stream')).toHaveTextContent('first file is ready');
  expect(screen.queryByTestId('programming-quiet')).not.toBeInTheDocument();
  view.unmount();
  client.clear();
});

it('explains a delayed queue and then shows model progress without empty tool records', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const task = {
    ...initial,
    status: 'queued',
    pending: null,
    events: [{ sequence: 1, kind: 'queued', at: new Date(Date.now() - 60000).toISOString() }],
  };
  (programmingTask as jest.Mock).mockResolvedValue(task);
  const view = mount(client);
  expect(await screen.findByText('com_codechat_task_queue_delayed')).toBeVisible();
  expect(screen.queryByText('com_codechat_task_steps')).not.toBeInTheDocument();
  (programmingTask as jest.Mock).mockResolvedValue({
    ...task,
    status: 'running',
    events: [...task.events, { sequence: 2, kind: 'started', at: new Date().toISOString() }],
  });
  await client.invalidateQueries();
  expect(await screen.findByText('com_codechat_task_model_waiting')).toBeVisible();
  expect(screen.queryByText('com_codechat_task_queue_delayed')).not.toBeInTheDocument();
  view.unmount();
  client.clear();
});

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
