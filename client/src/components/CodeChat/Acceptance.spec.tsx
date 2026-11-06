import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  taskAcceptance,
  saveTaskAcceptance,
  ProgrammingRequestError,
} from 'librechat-data-provider';
import type {
  TaskAcceptance,
  ProgrammingTask,
  AcceptanceInput,
  ProgrammingEvent,
} from 'librechat-data-provider';
import { executionEvidence } from './evidence';
import Acceptance from './Acceptance';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  taskAcceptance: jest.fn(),
  saveTaskAcceptance: jest.fn(),
}));
const id = '12345678-1234-4234-8234-123456789abc';
const task: ProgrammingTask = {
  id,
  conversation_id: 'chat',
  status: 'completed',
  error_code: null,
  pending: null,
  events: [],
  config: {
    conversation_id: 'chat',
    revision: 1,
    project_path: 'demo',
    strategy: 'implement',
    approval: 'strict',
    mcp_servers: [],
    model: 'model',
  },
};
let record: TaskAcceptance;
function mount(status = 'completed') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });
  return render(
    <QueryClientProvider client={client}>
      <Acceptance task={{ ...task, status }} token="synthetic" userId="owner" />
    </QueryClientProvider>,
  );
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
async function open() {
  click('com_codechat_acceptance_title');
  await screen.findByLabelText('com_codechat_acceptance_goal');
}
beforeEach(() => {
  jest.clearAllMocks();
  record = {
    task_id: id,
    project_path: 'demo',
    task_status: 'completed',
    request: { text: 'Export records', truncated: false },
    revision: 1,
    goal: 'Export records',
    criteria: [{ id, text: 'CSV preserves Chinese', result: 'pending' }],
    note: '',
    updated_at: '2026-11-06T00:00:00Z',
  };
  (taskAcceptance as jest.Mock).mockImplementation(async () => record);
  (saveTaskAcceptance as jest.Mock).mockImplementation(
    async (_token: string, _id: string, body: AcceptanceInput) => {
      record = { ...record, ...body, revision: body.revision + 1 };
      return record;
    },
  );
});

it('loads on demand and reads saved user acceptance after remount', async () => {
  const view = mount();
  expect(taskAcceptance).not.toHaveBeenCalled();
  await open();
  fireEvent.change(screen.getByLabelText('com_codechat_acceptance_result'), {
    target: { value: 'passed' },
  });
  fireEvent.change(screen.getByLabelText('com_codechat_acceptance_note'), {
    target: { value: 'Opened exported CSV' },
  });
  click('com_codechat_acceptance_save');
  await screen.findByText('com_codechat_acceptance_saved');
  expect(saveTaskAcceptance).toHaveBeenCalledWith(
    'synthetic',
    id,
    expect.objectContaining({
      revision: 1,
      note: 'Opened exported CSV',
      criteria: [expect.objectContaining({ result: 'passed' })],
    }),
  );
  view.unmount();
  mount();
  await open();
  expect(screen.getByLabelText('com_codechat_acceptance_result')).toHaveValue('passed');
  expect(screen.getByLabelText('com_codechat_acceptance_note')).toHaveValue('Opened exported CSV');
});

it('resets a changed criterion and requires saving requirements before confirming again', async () => {
  record.criteria[0].result = 'passed';
  mount();
  await open();
  fireEvent.change(screen.getByLabelText('com_codechat_acceptance_item'), {
    target: { value: 'CSV also preserves dates' },
  });
  expect(screen.getByLabelText('com_codechat_acceptance_result')).toHaveValue('pending');
  expect(screen.getByLabelText('com_codechat_acceptance_result')).toBeDisabled();
  click('com_codechat_acceptance_save');
  await screen.findByText('com_codechat_acceptance_saved');
  expect(screen.getByLabelText('com_codechat_acceptance_result')).not.toBeDisabled();
});

it('allows drafting requirements but not acceptance while a task is running', async () => {
  mount('running');
  await open();
  expect(screen.getByLabelText('com_codechat_acceptance_item')).not.toBeDisabled();
  expect(screen.getByLabelText('com_codechat_acceptance_result')).toBeDisabled();
});

it('retains the local draft on conflict and asks before discarding it', async () => {
  (saveTaskAcceptance as jest.Mock).mockRejectedValue(new ProgrammingRequestError(409));
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  mount();
  await open();
  fireEvent.change(screen.getByLabelText('com_codechat_acceptance_note'), {
    target: { value: 'Keep my work' },
  });
  click('com_codechat_acceptance_save');
  await screen.findByText('com_codechat_acceptance_conflict');
  expect(screen.getByLabelText('com_codechat_acceptance_note')).toHaveValue('Keep my work');
  click('com_codechat_acceptance_reload');
  expect(confirm).toHaveBeenCalled();
  expect(taskAcceptance).toHaveBeenCalledTimes(1);
  expect(saveTaskAcceptance).toHaveBeenCalledTimes(1);
  confirm.mockRestore();
});

it('does not show an empty editable record when loading fails', async () => {
  (taskAcceptance as jest.Mock).mockRejectedValueOnce(new ProgrammingRequestError(503));
  mount();
  click('com_codechat_acceptance_title');
  await screen.findByText('com_codechat_acceptance_load_failed');
  expect(screen.queryByLabelText('com_codechat_acceptance_goal')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'com_codechat_acceptance_save' })).toBeDisabled();
  click('com_codechat_retry');
  await waitFor(() =>
    expect(screen.getByLabelText('com_codechat_acceptance_goal')).toHaveValue('Export records'),
  );
});

it('summarizes observed writes and command exits without treating approval or reads as changes', () => {
  const events = [
    { kind: 'file', path: 'a.py', operation: 'write' },
    { kind: 'file', path: 'a.py', operation: 'write' },
    { kind: 'file', path: 'read.txt', operation: 'read' },
    { kind: 'approval', path: 'pending.py', operation: 'write' },
    { kind: 'terminal', exit_code: 0 },
    { kind: 'terminal', exit_code: 1 },
    { kind: 'terminal', exit_code: null },
  ].map((event, index) => ({
    ...event,
    sequence: index + 1,
    at: '2026-11-06T00:00:00Z',
  })) as ProgrammingEvent[];
  expect(executionEvidence(events)).toEqual({
    files: ['a.py'],
    commands: { succeeded: 1, failed: 1, unknown: 1 },
  });
});
