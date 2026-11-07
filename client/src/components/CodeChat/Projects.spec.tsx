import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { aiProjects } from 'librechat-data-provider';
import Engineering from './Engineering';
import Projects from './Projects';
jest.mock('~/hooks', () => ({ useAuthContext: () => ({user: {id: 'owner'}, token: 'test'}), useLocalize: () => (key: string) => key }));
jest.mock('librechat-data-provider', () => ({ ...jest.requireActual('librechat-data-provider'), aiProjects: jest.fn() }));
jest.mock('./Assistants', () => () => null);
jest.mock('./Engineering', () => jest.fn(() => null));
it('keeps code projects secondary and excludes assistants from the duplicate engineering list', async () => {
  (aiProjects as jest.Mock).mockResolvedValue({enabled: true, projects: [{project: {id: 'assistant'}}]});
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><Projects enabled path="" onOpen={jest.fn()} /></QueryClientProvider>);
  await waitFor(() => expect(aiProjects).toHaveBeenCalled());
  expect(Engineering).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('com_project_engineering'));
  await waitFor(() => expect(Engineering).toHaveBeenCalledWith(expect.objectContaining({exclude: ['assistant']}), expect.anything()));
});
