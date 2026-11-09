import { renderHook, act } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';

const mockNewConversation = jest.fn();
const mockGetConversation = jest.fn();
const mockGetDefaultConversation = jest.fn();

jest.mock('~/hooks/useNewConvo', () => ({
  __esModule: true,
  default: jest.fn(() => ({ newConversation: mockNewConversation })),
}));

jest.mock('~/hooks/Conversations/useGetConversation', () => ({
  __esModule: true,
  default: jest.fn(() => mockGetConversation),
}));

jest.mock('~/hooks/Conversations/useDefaultConvo', () => ({
  __esModule: true,
  default: jest.fn(() => mockGetDefaultConversation),
}));

jest.mock('~/Providers/AgentsMapContext', () => ({
  useAgentsMapContext: jest.fn(() => ({ 'agent-1': { id: 'agent-1', name: 'Agent' } })),
}));

jest.mock('~/utils', () => ({
  logger: { log: jest.fn() },
  specDisplayFieldReset: {
    spec: null,
    iconURL: null,
    modelLabel: null,
    greeting: undefined,
  },
}));

import useSelectAgent from '../useSelectAgent';

describe('useSelectAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConversation.mockReturnValue({ endpoint: EModelEndpoint.agents } as TConversation);
    mockGetDefaultConversation.mockImplementation(
      ({
        conversation,
        preset,
      }: {
        conversation: Partial<TConversation>;
        preset: Partial<TConversation>;
      }) => ({
        ...conversation,
        ...preset,
      }),
    );
  });

  it('opens one fresh conversation and does not reset it after selection', async () => {
    const { result } = renderHook(() => useSelectAgent());

    await act(async () => {
      await result.current.onSelect('agent-1');
    });

    expect(mockNewConversation).toHaveBeenCalledTimes(1);
    expect(mockNewConversation.mock.calls[0][0].template).toMatchObject({
      conversationId: 'new',
      agent_id: 'agent-1',
    });
  });

  it('keeps the current conversation when the agent is unknown', async () => {
    const { result } = renderHook(() => useSelectAgent());

    await act(async () => {
      await result.current.onSelect('unknown');
    });

    expect(mockNewConversation).not.toHaveBeenCalled();
  });

  it('keeps the composer for the assistants path as well', async () => {
    mockGetConversation.mockReturnValue({
      endpoint: EModelEndpoint.assistants,
    } as TConversation);
    const { result } = renderHook(() => useSelectAgent());

    await act(async () => {
      await result.current.onSelect('agent-1');
    });

    expect(mockGetDefaultConversation).not.toHaveBeenCalled();
    expect(mockNewConversation).toHaveBeenCalledTimes(1);
    expect(mockNewConversation.mock.calls[0][0].template.agent_id).toBe('agent-1');
  });

  it('clears model spec display fields when selecting an agent', async () => {
    mockGetConversation.mockReturnValue({
      endpoint: EModelEndpoint.openAI,
      spec: 'ClickHouse Agent',
      iconURL: EModelEndpoint.bedrock,
      modelLabel: 'ClickHouse Agent',
    } as TConversation);
    const { result } = renderHook(() => useSelectAgent());

    await act(async () => {
      await result.current.onSelect('agent-1');
    });

    const firstConversation = mockNewConversation.mock.calls[0][0].template;
    expect(firstConversation).toMatchObject({
      endpoint: EModelEndpoint.agents,
      agent_id: 'agent-1',
      spec: null,
      iconURL: null,
      modelLabel: null,
      codeWorkspaces: undefined,
    });
  });

  it('does not carry a prior agent workspace binding into the selected agent', async () => {
    mockGetConversation.mockReturnValue({
      endpoint: EModelEndpoint.agents,
      agent_id: 'agent-old',
      codeWorkspaces: [{ environmentId: 'machine-a', workspaceId: 'project-old' }],
    } as TConversation);
    const { result } = renderHook(() => useSelectAgent());

    await act(async () => {
      await result.current.onSelect('agent-1');
    });

    expect(mockNewConversation.mock.calls[0][0].template.codeWorkspaces).toBeUndefined();
    expect(mockGetDefaultConversation.mock.calls[0][0].conversation.codeWorkspaces).toBeUndefined();
  });

  it('preserves the workspace when selecting the same agent', async () => {
    const selectedWorkspace = [{ environmentId: 'machine-a', workspaceId: 'project-a' }];
    mockGetConversation.mockReturnValue({
      endpoint: EModelEndpoint.agents,
      agent_id: 'agent-1',
      codeWorkspaces: selectedWorkspace,
    } as TConversation);
    const { result } = renderHook(() => useSelectAgent());

    await act(async () => {
      await result.current.onSelect('agent-1');
    });

    expect(mockNewConversation.mock.calls[0][0].template.codeWorkspaces).toEqual(selectedWorkspace);
  });
});
