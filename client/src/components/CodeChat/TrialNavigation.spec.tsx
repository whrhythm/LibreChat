import { Provider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { projectTrials } from 'librechat-data-provider';
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
