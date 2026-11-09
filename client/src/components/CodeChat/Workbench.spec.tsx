import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { programmingPreference, saveProgrammingPreference } from 'librechat-data-provider';
import Workbench from './Workbench';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ token: 'owner-token', user: { id: 'owner' } }),
}));
jest.mock('./MCP', () => () => null);
jest.mock('./NewFolder', () => () => null);
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  programmingPreference: jest.fn(),
  saveProgrammingPreference: jest.fn(),
  personalModelSettings: jest.fn().mockResolvedValue({ models: [{ name: 'coder' }] }),
  personalFileRequest: jest.fn().mockResolvedValue({ json: async () => ({ entries: [] }) }),
  workspaceProjects: jest.fn().mockResolvedValue({ projects: [] }),
}));

it.each(['default', 'project-owned'])(
  'saves the isolated %s developer model without switching chat',
  async (scope) => {
    jest.clearAllMocks();
    (programmingPreference as jest.Mock).mockResolvedValue({
      conversation_id: scope,
      revision: 2,
      project_path: scope === 'default' ? '' : 'owned',
      strategy: 'implement',
      approval: 'strict',
      mcp_servers: [],
    });
    (saveProgrammingPreference as jest.Mock).mockResolvedValue({});
    const chooseModel = jest.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Workbench
          conversationId={scope}
          rootPath={scope === 'default' ? undefined : 'owned'}
          embedded
          disabled={false}
          chooseModel={chooseModel}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole('option', { name: 'coder' });
    fireEvent.change(screen.getByRole('combobox', { name: 'com_codechat_programming_model' }), {
      target: { value: 'coder' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_codechat_programming_save' }));
    await waitFor(() =>
      expect(saveProgrammingPreference).toHaveBeenCalledWith(
        'owner-token',
        expect.objectContaining({ conversation_id: scope, coding_model: 'coder', revision: 2 }),
      ),
    );
    expect(chooseModel).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  },
);
