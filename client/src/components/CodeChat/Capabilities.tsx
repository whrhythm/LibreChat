import { Button } from '@librechat/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Constants,
  QueryKeys,
  codechatCapability,
  withCodeChatCapability,
} from 'librechat-data-provider';
import type { CodeChatCapabilities, TConversation } from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import { useLocalize } from '~/hooks';

export default function Capabilities({
  config,
  conversation,
  setConversation,
  disabled,
}: {
  config?: CodeChatCapabilities;
  conversation: TConversation | null;
  setConversation: SetterOrUpdater<TConversation | null>;
  disabled: boolean;
}) {
  const localize = useLocalize();
  const client = useQueryClient();
  if (!config?.enabled || (conversation?.endpoint && conversation.endpoint !== config.endpoint)) {
    return null;
  }
  const selected = codechatCapability(conversation, config);
  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-1"
      role="group"
      aria-label={localize('com_codechat_capabilities')}
    >
      {(['chat', 'coding'] as const).map((capability) => (
        <Button
          key={capability}
          type="button"
          variant={selected === capability ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={selected === capability}
          disabled={disabled || conversation == null}
          onClick={() => {
            setConversation((current) =>
              current == null ? current : withCodeChatCapability(current, capability, config),
            );
            const id = conversation?.conversationId;
            if (conversation && id && id !== Constants.NEW_CONVO) {
              client.setQueryData<TConversation>([QueryKeys.conversation, id], (cached) =>
                withCodeChatCapability(cached ?? conversation, capability, config),
              );
            }
          }}
        >
          {localize(
            capability === 'coding'
              ? 'com_codechat_capability_coding'
              : 'com_codechat_capability_chat',
          )}
        </Button>
      ))}
      {(['writing', 'music'] as const).map((capability) => (
        <Button
          key={capability}
          type="button"
          variant="ghost"
          size="sm"
          disabled
          title={localize('com_codechat_coming_soon')}
        >
          {localize(
            capability === 'writing'
              ? 'com_codechat_capability_writing'
              : 'com_codechat_capability_music',
          )}
          {' · '}
          {localize('com_codechat_coming_soon')}
        </Button>
      ))}
      <p className="text-text-secondary w-full text-xs" role="status">
        {localize(
          selected === 'coding'
            ? 'com_codechat_capability_coding_hint'
            : 'com_codechat_capability_chat_hint',
        )}
      </p>
    </div>
  );
}
