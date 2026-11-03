import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  codechatCapabilitiesSchema,
  withCodeChatCapability,
  codechatCapability,
  EModelEndpoint,
} from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import Capabilities from './Capabilities';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
const config = codechatCapabilitiesSchema.parse({ enabled: true });
const record: TConversation = {
  conversationId: 'existing-conversation',
  endpoint: 'LiteLLM' as EModelEndpoint,
  model: 'deepseek',
  chatProjectId: 'my-project',
  title: 'Keep this',
  codeWorkspaces: [{ environmentId: 'my-environment', workspaceId: 'my-workspace' }],
  parentMessageId: 'previous-reply',
  messages: ['previous-question', 'previous-reply'],
  createdAt: '2026-11-03T00:00:00Z',
  updatedAt: '2026-11-03T00:00:00Z',
};

function mount(disabled = false) {
  function Host() {
    const [conversation, setConversation] = useState<TConversation | null>(record);
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
    expect.objectContaining({ ...record, model: config.codingRoute, maxContextTokens: 32000 }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_capability_chat' }));
  expect(screen.getByRole('button', { name: 'com_codechat_capability_chat' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('blocks mode switches during execution and marks future capabilities unavailable', () => {
  mount(true);
  expect(screen.getByRole('button', { name: 'com_codechat_capability_coding' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /com_codechat_capability_writing/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /com_codechat_capability_music/ })).toBeDisabled();
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
