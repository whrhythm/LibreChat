import { personalFileRequest } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FormEvent } from 'react';
import NewFolder from './NewFolder';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'synthetic-token' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  personalFileRequest: jest.fn(),
}));

it('creates a folder without submitting its enclosing project association form', async () => {
  (personalFileRequest as jest.Mock).mockResolvedValue({});
  const submit = jest.fn((event: FormEvent) => event.preventDefault());
  const created = jest.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <form onSubmit={submit}>
        <NewFolder path="" onCreated={created} />
      </form>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_folder_create' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('com_codechat_folder_name'), {
    target: { value: 'synthetic-project' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'com_codechat_folder_create' }));
  await waitFor(() => expect(created).toHaveBeenCalledWith('synthetic-project'));
  expect(personalFileRequest).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
});
