/* eslint-disable i18next/no-literal-string -- Synthetic child components isolate navigation; these labels are test fixtures. */
import { personalFileRequest } from 'librechat-data-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Space from './Space';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'pane-test' }, token: 'synthetic-token' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('./ApplicationNotice', () => () => null);
jest.mock('./Capacity', () => () => null);
jest.mock('./Databases', () => () => null);
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { codechat: { databases: { enabled: true } } } }),
}));
jest.mock(
  './Files',
  () =>
    ({ path, onPathChange }: { path: string; onPathChange: (path: string) => void }) => (
      <div>
        <button onClick={() => onPathChange('my-project')}>Browse my project</button>
        <span>Files at {path}</span>
      </div>
    ),
);
jest.mock('./Applications', () => ({ path, canPublish }: { path: string; canPublish: boolean }) => (
  <div>
    Applications at {path} {canPublish ? 'publish available' : ''}
  </div>
));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  personalFileRequest: jest.fn(),
}));

it('keeps file navigation while separating applications and selects the browsed project', async () => {
  (personalFileRequest as jest.Mock).mockImplementation(
    async (_token, endpoint, _method, path) => ({
      json: async () =>
        endpoint === 'ensure'
          ? { status: 'ready', storage_gib: 2 }
          : {
              entries: path
                ? [{ name: 'Dockerfile', kind: 'file' }]
                : [{ name: 'my-project', kind: 'directory' }],
            },
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Space />
    </QueryClientProvider>,
  );
  expect(screen.queryByText(/Applications at/)).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Browse my project' }));
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'com_codechat_apps' }), {
    button: 0,
    ctrlKey: false,
  });
  await screen.findByText('Applications at my-project publish available');
  expect(screen.queryByRole('tab', { name: 'com_codechat_db_tab' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('com_codechat_publish_project')).toHaveValue('my-project');
  expect(screen.getByText('Files at my-project')).not.toBeVisible();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'com_codechat_files_tab' }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByText('Files at my-project')).toBeVisible();
});
