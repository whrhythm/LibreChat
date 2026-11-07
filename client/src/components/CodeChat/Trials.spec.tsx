import { MemoryRouter } from 'react-router-dom';
import { projectTrials } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Trials from './Trials';
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'test' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  projectTrials: jest.fn(),
}));
const data = {
  config: {
    instructions: 'original',
    model: 'test',
    temperature: 0,
    max_output_tokens: 512,
    response_style: 'grounded',
  },
  digest: 'a'.repeat(64),
  revision: 1,
  models: ['test'],
  output_limit: 4096,
  trials: [],
};
function mount() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
      >
        <Trials projectId="project" />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_trials_title' }));
}
beforeEach(() => jest.clearAllMocks());
it('exposes stable input labels and saves against the loaded draft digest', async () => {
  (projectTrials as jest.Mock).mockResolvedValue(data);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'com_trials_edit' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'com_trials_instructions' }), {
    target: { value: 'updated' },
  });
  fireEvent.click(screen.getByText('com_project_advanced'));
  fireEvent.change(screen.getByRole('combobox', { name: 'com_trials_style' }), {
    target: { value: 'support' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_trials_save' }));
  await waitFor(() =>
    expect(projectTrials).toHaveBeenCalledWith('test', 'project', '/update', {
      expected_digest: data.digest,
      config: { ...data.config, instructions: 'updated', response_style: 'support' },
    }),
  );
});
it('does not repeat model calls or silently create another preview after a lost reply', async () => {
  (projectTrials as jest.Mock).mockImplementation((_token, _id, _suffix, body) =>
    body ? Promise.reject(new Error('timeout')) : Promise.resolve(data),
  );
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'com_trials_create' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('com_trials_error');
  fireEvent.click(screen.getByRole('button', { name: 'com_trials_retry' }));
  await waitFor(() =>
    expect((projectTrials as jest.Mock).mock.calls.filter((c) => c[3])).toHaveLength(2),
  );
  const calls = (projectTrials as jest.Mock).mock.calls.filter((c) => c[3]);
  expect(calls[0][3].request_id).toBe(calls[1][3].request_id);
});
it('shows outdated accepted previews as historical rather than accepted current drafts', async () => {
  (projectTrials as jest.Mock).mockResolvedValue({
    ...data,
    trials: [
      {
        id: 'old',
        number: 1,
        agent_id: 'agent_trial_old',
        state: 'ready',
        digest: 'b'.repeat(64),
        model: 'test',
        acceptance: { outcome: 'passed', note: 'Old review' },
        acceptance_valid: false,
      },
    ],
  });
  mount();
  expect(await screen.findByText('com_trials_outdated')).toBeVisible();
  expect(screen.queryByText('com_trials_passed')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'com_trials_open' })).toHaveAttribute(
    'href',
    '/c/new?endpoint=agents&agent_id=agent_trial_old',
  );
});
