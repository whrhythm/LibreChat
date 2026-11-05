import { programmingMCP } from 'librechat-data-provider';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MCP from './MCP';

jest.mock('./MCPCredential', () => () => <p>{'personal credential form'}</p>);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ token: 'synthetic', user: { id: 'owner' } }),
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  programmingMCP: jest.fn(),
}));
const connector = {
  id: 'deepwiki',
  name: 'DeepWiki',
  enabled: true,
  tools: ['ask_question'],
  description: 'Public documentation',
  url: 'https://mcp.deepwiki.com/mcp',
  data_notice: 'Query leaves the platform',
};
function mount(selected: string[] = []) {
  const change = jest.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MCP selected={selected} onChange={change} />
    </QueryClientProvider>,
  );
  return change;
}
beforeEach(() => jest.clearAllMocks());

it('requires explicit opt-in and shows the data boundary', async () => {
  (programmingMCP as jest.Mock).mockResolvedValue({ servers: [connector] });
  const change = mount();
  const checkbox = await screen.findByRole('checkbox');
  expect(checkbox).not.toBeChecked();
  expect(screen.getByText('Query leaves the platform')).toBeInTheDocument();
  fireEvent.click(checkbox);
  expect(change).toHaveBeenCalledWith(['deepwiki']);
});

it('allows removing a selection revoked by the administrator', async () => {
  (programmingMCP as jest.Mock).mockResolvedValue({ servers: [{ ...connector, enabled: false }] });
  const change = mount(['deepwiki']);
  const checkbox = await screen.findByRole('checkbox');
  expect(checkbox).toBeEnabled();
  expect(screen.getByText('com_codechat_mcp_disabled')).toBeInTheDocument();
  fireEvent.click(checkbox);
  expect(change).toHaveBeenCalledWith([]);
});

it('cannot select a connector disabled by the administrator', async () => {
  (programmingMCP as jest.Mock).mockResolvedValue({ servers: [{ ...connector, enabled: false }] });
  mount();
  expect(await screen.findByRole('checkbox')).toBeDisabled();
});

it('requires a current personal credential before selecting a private connection', async () => {
  (programmingMCP as jest.Mock).mockResolvedValue({
    servers: [{ ...connector, auth: 'user_bearer', credential_configured: false }],
  });
  mount();
  expect(await screen.findByRole('checkbox')).toBeDisabled();
  expect(screen.getByText('personal credential form')).toBeInTheDocument();
});
