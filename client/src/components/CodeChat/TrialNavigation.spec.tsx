import { Provider, createStore } from 'jotai';
import { projectTrials } from 'librechat-data-provider';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Trials from './Trials';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'test' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  projectTrials: jest.fn(),
}));

it('offers acceptance from the root sidebar, outside the chat route outlet', async () => {
  const conversation = '11111111-1111-4111-8111-111111111111';
  (projectTrials as jest.Mock).mockResolvedValue({
    config: {
      instructions: 'Test',
      model: 'test',
      response_style: 'grounded',
      temperature: 0,
      max_output_tokens: 512,
    },
    digest: 'a'.repeat(64),
    revision: 1,
    models: ['test'],
    output_limit: 4096,
    trials: [
      {
        id: 'trial',
        number: 1,
        agent_id: 'agent_trial_test',
        state: 'ready',
        digest: 'a'.repeat(64),
        model: 'test',
        acceptance: null,
        conversation_ids: [conversation],
      },
    ],
  });
  render(
    <Provider store={createStore()}>
      <MemoryRouter initialEntries={['/c/' + conversation]}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
        >
          <Trials projectId="project" embedded mode="preview" />
        </QueryClientProvider>
      </MemoryRouter>
    </Provider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'com_trials_review' }));
  expect(screen.getByRole('textbox', { name: 'com_trials_note' })).toBeVisible();
});

it('refreshes trial associations when the first answer navigates away from a new chat', async () => {
  const conversation = '22222222-2222-4222-8222-222222222222';
  const data = {
    config: {
      instructions: 'Test',
      model: 'test',
      response_style: 'grounded',
      temperature: 0,
      max_output_tokens: 512,
    },
    digest: 'b'.repeat(64),
    revision: 1,
    models: ['test'],
    output_limit: 4096,
    trials: [
      {
        id: 'trial',
        number: 1,
        agent_id: 'agent_trial_test',
        state: 'ready',
        digest: 'b'.repeat(64),
        model: 'test',
        acceptance: null,
        conversation_ids: [],
      },
    ],
  };
  (projectTrials as jest.Mock)
    .mockReset()
    .mockResolvedValueOnce(data)
    .mockResolvedValue({
      ...data,
      trials: [{ ...data.trials[0], conversation_ids: [conversation] }],
    });
  function Sidebar() {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate('/c/' + conversation)}>{'Finish first answer'}</button>
        <Trials projectId="project" embedded mode="preview" />
      </>
    );
  }
  render(
    <Provider store={createStore()}>
      <MemoryRouter initialEntries={['/c/new']}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
        >
          <Sidebar />
        </QueryClientProvider>
      </MemoryRouter>
    </Provider>,
  );
  await screen.findByRole('link', { name: 'com_trials_open' });
  expect(screen.queryByRole('button', { name: 'com_trials_review' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Finish first answer' }));
  expect(await screen.findByRole('button', { name: 'com_trials_review' })).toBeVisible();
  expect(projectTrials).toHaveBeenCalledTimes(2);
  expect((projectTrials as jest.Mock).mock.calls.every((args) => args.length === 2)).toBe(true);
});
