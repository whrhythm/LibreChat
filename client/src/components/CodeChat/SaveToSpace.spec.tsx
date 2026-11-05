import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { dataService, personalFileRequest, PersonalFileError } from 'librechat-data-provider';
import SaveToSpace from './SaveToSpace';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'alice' }, token: 'synthetic' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('~/Providers', () => ({ useShareContext: () => ({}) }));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  personalFileRequest: jest.fn(),
  dataService: { getFileDownload: jest.fn(), getCodeOutputDownload: jest.fn() },
}));
const request = jest.mocked(personalFileRequest);
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          logger: { log: console.log, warn: console.warn, error: () => undefined },
        })
      }
    >
      <SaveToSpace
        files={[
          { filename: 'result.txt', filepath: '/uploads/result', file_id: 'file-1', user: 'alice' },
        ]}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  request.mockImplementation(
    async (_token, endpoint) =>
      ({
        json: async () =>
          endpoint === 'directories' ? { entries: [{ name: 'project', kind: 'directory' }] } : {},
      }) as Response,
  );
  jest
    .mocked(dataService.getFileDownload)
    .mockResolvedValue({ data: new Blob(['hello']) } as never);
});
it('saves an authenticated artifact into the selected directory without overwrite', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_save_generated' }));
  fireEvent.click(await screen.findByRole('button', { name: 'project' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'com_ui_save' })).not.toBeDisabled(),
  );
  fireEvent.change(screen.getByLabelText('com_codechat_save_generated_name'), {
    target: { value: 'copy.txt' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
  await screen.findByRole('status');
  expect(dataService.getFileDownload).toHaveBeenCalledWith('alice', 'file-1');
  expect(request).toHaveBeenCalledWith(
    'synthetic',
    'file',
    'PUT',
    'project/copy.txt',
    expect.any(Blob),
  );
  expect(screen.getByRole('button', { name: 'com_ui_save' })).toBeDisabled();
});
it.each(['conflict', 'full'] as const)(
  'shows actionable %s feedback without retrying',
  async (code) => {
    request.mockImplementation(async (_token, endpoint) => {
      if (endpoint === 'file') throw new PersonalFileError(code);
      return { json: async () => ({ entries: [] }) } as Response;
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'com_codechat_save_generated' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'com_ui_save' })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      code === 'full' ? 'com_codechat_save_generated_full' : 'com_codechat_save_generated_conflict',
    );
    expect(request.mock.calls.filter((call) => call[1] === 'file')).toHaveLength(1);
  },
);
