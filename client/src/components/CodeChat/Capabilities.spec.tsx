import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  codechatCapabilitiesSchema,
  withCodeChatCapability,
  codechatCapability,
  EModelEndpoint,
  Constants,
} from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import Capabilities from './Capabilities';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ user: null, token: null }),
}));
const config = codechatCapabilitiesSchema.parse({
  enabled: true,
  chatModel: 'chat-model',
  codingModel: 'coding-model',
  allowedModels: ['chat-model', 'coding-model'],
});
const record: TConversation = {
  conversationId: 'existing-conversation',
  endpoint: 'LiteLLM' as EModelEndpoint,
  model: 'chat-model',
  chatProjectId: 'my-project',
  title: 'Keep this',
  codeWorkspaces: [{ environmentId: 'my-environment', workspaceId: 'my-workspace' }],
  parentMessageId: 'previous-reply',
  messages: ['previous-question', 'previous-reply'],
  createdAt: '2026-11-03T00:00:00Z',
  updatedAt: '2026-11-03T00:00:00Z',
};

function mount(disabled = false, initial: TConversation = record) {
  function Host() {
    const [conversation, setConversation] = useState<TConversation | null>(initial);
    return (
      <>
        <Capabilities
          config={config}
          conversation={conversation}
          setConversation={setConversation}
          disabled={disabled}
        />
        <output data-testid="conversation-record">{JSON.stringify(conversation)}</output>
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Host />
    </QueryClientProvider>,
  );
}

it('changes the next route while retaining conversation, project, workspace and title', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_capability_coding' }));
  expect(JSON.parse(screen.getByTestId('conversation-record').textContent ?? '{}')).toEqual(
    expect.objectContaining({
      ...record,
      model: config.codingModel,
      codechatCapability: 'coding',
      maxContextTokens: 32000,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_capability_chat' }));
  expect(screen.getByRole('button', { name: 'com_codechat_capability_chat' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('blocks switches during execution and keeps unimplemented capabilities out of the composer', () => {
  mount(true);
  expect(screen.getByRole('button', { name: 'com_codechat_capability_coding' })).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: /com_codechat_capability_writing/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /com_codechat_capability_music/ }),
  ).not.toBeInTheDocument();
});

it('restores the coding pick from a stored route and accepts legacy OpenHands conversations', () => {
  const coding = withCodeChatCapability(record, 'coding', config);
  expect(codechatCapability(JSON.parse(JSON.stringify(coding)), config)).toBe('coding');
  expect(codechatCapability({ model: 'OpenHands' }, config)).toBe('coding');
  expect(codechatCapabilitiesSchema.parse({}).enabled).toBe(false);
  expect(
    codechatCapabilitiesSchema.safeParse({ chatRoute: 'same', codingRoute: 'same' }).success,
  ).toBe(false);
});

it('makes an empty new Agents chat usable without selecting a provider', () => {
  mount(false, {
    ...record,
    conversationId: String(Constants.NEW_CONVO),
    endpoint: EModelEndpoint.agents,
    model: undefined,
  });
  expect(JSON.parse(screen.getByTestId('conversation-record').textContent ?? '{}')).toEqual(
    expect.objectContaining({
      conversationId: Constants.NEW_CONVO,
      endpoint: config.endpoint,
      model: config.chatModel,
    }),
  );
  expect(screen.getByRole('button', { name: 'com_codechat_capability_coding' })).not.toBeDisabled();
});

it('offers Coding on an existing conversation from another endpoint without replacing its id', () => {
  mount(false, { ...record, endpoint: EModelEndpoint.agents });
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_capability_coding' }));
  expect(JSON.parse(screen.getByTestId('conversation-record').textContent ?? '{}')).toEqual(
    expect.objectContaining({
      conversationId: record.conversationId,
      model: config.codingModel,
      messages: record.messages,
    }),
  );
});

it('retains separate selected models and preserves native agent conversations', () => {
  const coding = withCodeChatCapability(record, 'coding', config, 'chat-model');
  const chat = withCodeChatCapability(coding, 'chat', config);
  expect(chat.model).toBe('chat-model');
  expect(withCodeChatCapability(chat, 'coding', config).model).toBe('chat-model');
  mount(false, {
    ...record,
    endpoint: EModelEndpoint.agents,
    conversationId: String(Constants.NEW_CONVO),
    agent_id: 'owned-agent',
  });
  expect(
    screen.queryByRole('group', { name: 'com_codechat_capabilities' }),
  ).not.toBeInTheDocument();
  expect(JSON.parse(screen.getByTestId('conversation-record').textContent ?? '{}').agent_id).toBe(
    'owned-agent',
  );
});
