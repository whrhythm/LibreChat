import { personalFileRequest } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PersonalFiles from './Files';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'alice' }, token: 'synthetic-token' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  personalFileRequest: jest.fn(),
  personalApplicationRequest: jest.fn(async () => ({ json: async () => ({ apps: [] }) })),
}));
const request = personalFileRequest as jest.MockedFunction<typeof personalFileRequest>;

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PersonalFiles expanded />
    </QueryClientProvider>,
  );
}

describe('personal files in the chat sidebar', () => {
  beforeEach(() => request.mockReset());

  it('automatically prepares space, then uploads and refreshes the file list', async () => {
    let uploaded = false;
    request.mockImplementation(async (_token, endpoint, method) => {
      if (endpoint === 'file' && method === 'PUT') uploaded = true;
      return {
        json: async () =>
          endpoint === 'ensure'
            ? { status: 'ready', storage_gib: 2 }
            : { entries: uploaded ? [{ name: 'hello.py', kind: 'file', size: 5 }] : [] },
      } as Response;
    });
    mount();
    await screen.findByText('com_codechat_files_empty');
    const file = new File(['hello'], 'hello.py', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('com_ui_upload_files'), { target: { files: [file] } });
    await screen.findByText('hello.py');
    expect(request).toHaveBeenCalledWith('synthetic-token', 'file', 'PUT', 'hello.py', file);
  });

  it('does not read files or offer uploads before the disk is ready', async () => {
    request.mockResolvedValue({
      json: async () => ({ status: 'preparing', storage_gib: 2 }),
    } as Response);
    mount();
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent('com_codechat_files_preparing');
    expect(screen.queryByRole('button', { name: 'com_ui_upload_files' })).not.toBeInTheDocument();
    expect(request.mock.calls.every((call) => call[1] === 'ensure')).toBe(true);
  });
});
