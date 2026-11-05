import { TextDecoder, TextEncoder } from 'node:util';
import { personalFileRequest } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PersonalFiles from './Files';

jest.mock('./CodeEditor', () => ({
  __esModule: true,
  default: ({
    value,
    readOnly,
    onChange,
    label,
  }: {
    value: string;
    readOnly: boolean;
    onChange: (value: string) => void;
    label: string;
  }) => (
    <textarea
      aria-label={label}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'alice' }, token: 'synthetic-token' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('~/data-provider', () => ({ useGetStartupConfig: () => ({ data: {} }) }));
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
  beforeEach(() => {
    request.mockReset();
    global.TextDecoder = TextDecoder as typeof global.TextDecoder;
  });

  it('automatically prepares space, then uploads and refreshes the file list', async () => {
    let uploaded = false;
    request.mockImplementation(async (_token, endpoint, method) => {
      if (endpoint === 'file' && method === 'PUT') uploaded = true;
      if (endpoint === 'usage')
        return {
          json: async () => ({
            used_bytes: 50,
            quota_bytes: 2048,
            physical_available_bytes: 999999999,
            observed_at: '2026-11-02T00:00:00Z',
          }),
        } as Response;
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

  function mockFile() {
    request.mockImplementation(async (_token, endpoint, method) => {
      if (endpoint === 'file' && method === 'GET')
        return {
          arrayBuffer: async () => new TextEncoder().encode('print("hello")').buffer,
          headers: new Headers({ etag: '"' + 'a'.repeat(64) + '"' }),
        } as Response;
      return {
        json: async () =>
          endpoint === 'ensure'
            ? { status: 'ready', storage_gib: 2 }
            : {
                entries: [
                  { name: 'hello.py', kind: 'file', size: 14, etag: '"' + 'a'.repeat(64) + '"' },
                ],
              },
      } as Response;
    });
  }

  it('previews file content in a dialog instead of downloading or replacing the chat', async () => {
    mockFile();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'hello.py' }));
    expect(await screen.findByText('print("hello")')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('synthetic-token', 'file', 'GET', 'hello.py');
  });

  it('guards unsaved edits and saves with the version that was actually opened', async () => {
    mockFile();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'com_codechat_file_edit' }));
    const editor = await screen.findByRole('textbox', { name: 'com_codechat_file_content' });
    await waitFor(() => expect(editor).toHaveValue('print("hello")'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: 'print("edited")' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));
    expect(screen.getByText('com_codechat_file_unsaved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_codechat_file_keep_editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'synthetic-token',
        'file',
        'PUT',
        'hello.py',
        expect.any(Blob),
        { overwrite: true, version: '"' + 'a'.repeat(64) + '"' },
      ),
    );
  });

  it('requires confirmation before deleting an uploaded or generated file', async () => {
    mockFile();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'com_codechat_file_actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'com_codechat_file_delete' }));
    expect(request.mock.calls.some((call) => call[2] === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'com_codechat_file_delete_confirm' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'synthetic-token',
        'file',
        'DELETE',
        'hello.py',
        undefined,
        { version: '"' + 'a'.repeat(64) + '"' },
      ),
    );
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

  it('lazily expands a folder without replacing its siblings', async () => {
    request.mockImplementation(
      async (_token, endpoint, _method, path) =>
        ({
          json: async () =>
            endpoint === 'ensure'
              ? { status: 'ready', storage_gib: 2 }
              : {
                  entries:
                    path === 'src'
                      ? [{ name: 'main.py', kind: 'file' }]
                      : [
                          { name: 'src', kind: 'directory' },
                          { name: 'README.md', kind: 'file' },
                        ],
                },
        }) as Response,
    );
    mount();
    const folder = await screen.findByRole('button', { name: 'src' });
    expect(folder).toHaveAttribute('aria-expanded', 'false');
    expect(request).not.toHaveBeenCalledWith('synthetic-token', 'directories', 'GET', 'src');
    fireEvent.click(folder);
    await screen.findByRole('button', { name: 'main.py' });
    expect(screen.getByRole('button', { name: 'README.md' })).toBeVisible();
    fireEvent.click(folder);
    expect(screen.queryByRole('button', { name: 'main.py' })).not.toBeInTheDocument();
  });
});
