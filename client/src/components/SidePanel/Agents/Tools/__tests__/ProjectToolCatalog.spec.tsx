import '@testing-library/jest-dom/extend-expect';
import { generatedToolCatalog } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import ProjectToolCatalog from '../ProjectToolCatalog';

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  generatedToolCatalog: jest.fn(),
}));
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { aiTrialsEnabled: true } }),
}));
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'synthetic' }),
  useLocalize: () => (key: string) => key,
}));

const reference = 'projecttool:logistics:' + 'a'.repeat(64);
const revoked = 'projecttool:logistics:' + 'b'.repeat(64);
const tools = [
  {
    id: 'v2',
    reference,
    title: '物流报价',
    project_id: 'owner-project',
    project_name: '物流项目',
    state: 'approved',
  },
  {
    id: 'v1',
    reference: revoked,
    title: '旧物流报价',
    project_id: 'owner-project',
    project_name: '物流项目',
    state: 'revoked',
  },
] as const;

function show(props: Partial<ComponentProps<typeof ProjectToolCatalog>> = {}) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });
  return render(
    <QueryClientProvider client={cache}>
      <ProjectToolCatalog search="" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  (generatedToolCatalog as jest.Mock).mockResolvedValue({ tools });
});

test('the global library shows the owning project, version and review with no selection button', async () => {
  show();
  await screen.findByText('物流报价');
  expect(screen.getAllByText('物流项目')).toHaveLength(2);
  expect(screen.getByText('aaaaaaaaaaaa').parentElement).toHaveAttribute('title', 'a'.repeat(64));
  expect(screen.getByText('com_releases_tool_approved')).toBeInTheDocument();
  expect(screen.getByText('com_releases_tool_revoked')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'com_ui_select' })).not.toBeInTheDocument();
});

test('only the owning draft can select its approved and available version', async () => {
  const select = jest.fn();
  show({ projectId: 'owner-project', onSelect: select, available: new Set([reference, revoked]) });
  const button = await screen.findByRole('button', { name: 'com_ui_select' });
  fireEvent.click(button);
  expect(select).toHaveBeenCalledWith(reference);
  const old = screen.getByText('旧物流报价').closest('li')!;
  expect(within(old).queryByRole('button')).not.toBeInTheDocument();
});

test('another project can search for the card but cannot select it', async () => {
  show({
    projectId: 'other-project',
    search: 'aaaaaaaaaaaa',
    onSelect: jest.fn(),
    available: new Set([reference]),
  });
  expect(await screen.findByText('物流报价')).toBeInTheDocument();
  expect(screen.queryByText('旧物流报价')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'com_ui_select' })).not.toBeInTheDocument();
});
