import { useEffect, useMemo } from 'react';
import { Button } from '@librechat/client';
import { Check, Code2, MessageSquare } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Constants,
  EModelEndpoint,
  QueryKeys,
  codechatCapability,
  withCodeChatCapability,
  personalModelSettings,
} from 'librechat-data-provider';
import type {
  CodeChatCapabilities,
  CodeChatCapability,
  TConversation,
} from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import { useAuthContext, useLocalize } from '~/hooks';

export default function Capabilities({
  config: startupConfig,
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
  const { user, token } = useAuthContext();
  const models = useQuery({
    queryKey: [QueryKeys.codechatModels, user?.id],
    queryFn: () => personalModelSettings(token!),
    enabled: !!startupConfig?.enabled && !!token && !!user?.id,
    staleTime: 30000,
    refetchInterval: 30000,
    retry: 1,
  });
  const config = useMemo(
    () =>
      startupConfig && models.data
        ? {
            ...startupConfig,
            chatModel: models.data.chat_model,
            codingModel: models.data.coding_model,
            allowedModels: models.data.models.map((model) => model.name),
          }
        : startupConfig,
    [startupConfig, models.data],
  );

  useEffect(() => {
    if (!config?.enabled || disabled || !conversation) return;
    const isNew =
      !conversation.conversationId || conversation.conversationId === Constants.NEW_CONVO;
    if (
      conversation.endpoint !== config.endpoint &&
      (!isNew || conversation.endpoint !== EModelEndpoint.agents || conversation.agent_id)
    )
      return;
    const legacy = [config.chatRoute, config.codingRoute, 'OpenHands'].includes(
      conversation.model ?? '',
    );
    if (
      conversation.endpoint === config.endpoint &&
      conversation.codechatCapability &&
      ((!legacy &&
        (!config.allowedModels || config.allowedModels.includes(conversation.model ?? ''))) ||
        !config.chatModel ||
        !config.codingModel)
    )
      return;
    setConversation((current) =>
      current
        ? withCodeChatCapability(
            current,
            current.endpoint === config.endpoint ? codechatCapability(current, config) : 'chat',
            config,
          )
        : current,
    );
  }, [config, conversation, disabled, setConversation]);

  if (!config?.enabled || (conversation?.endpoint !== config.endpoint && conversation?.agent_id))
    return null;
  const selected = codechatCapability(conversation, config);
  function choose(capability: CodeChatCapability, model?: string) {
    setConversation((current) =>
      current ? withCodeChatCapability(current, capability, config!, model) : current,
    );
    const id = conversation?.conversationId;
    if (conversation && id && id !== Constants.NEW_CONVO) {
      client.setQueryData<TConversation>([QueryKeys.conversation, id], (cached) =>
        withCodeChatCapability(cached ?? conversation, capability, config!, model),
      );
    }
  }
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      role="group"
      aria-label={localize('com_codechat_capabilities')}
    >
      {(['chat', 'coding'] as const).map((capability) => {
        const Icon =
          selected === capability ? Check : { chat: MessageSquare, coding: Code2 }[capability];
        return (
          <Button
            key={capability}
            type="button"
            size="xs"
            variant={selected === capability ? 'default' : 'ghost'}
            aria-pressed={selected === capability}
            disabled={disabled || conversation == null}
            title={localize(
              capability === 'coding'
                ? 'com_codechat_capability_coding_hint'
                : 'com_codechat_capability_chat_hint',
            )}
            onClick={() => choose(capability)}
          >
            <Icon className="mr-1 size-3" aria-hidden="true" />
            {localize(
              capability === 'coding'
                ? 'com_codechat_capability_coding'
                : 'com_codechat_capability_chat',
            )}
          </Button>
        );
      })}
      {models.data && (
        <select
          className="border-border-light bg-surface-primary text-text-primary hidden max-w-36 min-w-0 rounded border px-2 py-1 text-xs sm:block"
          aria-label={localize('com_codechat_model')}
          value={conversation?.model ?? ''}
          disabled={disabled || conversation == null}
          onChange={(event) => choose(selected, event.target.value)}
        >
          {models.data.models.map((model) => (
            <option key={model.name} value={model.name}>
              {model.name}
            </option>
          ))}
        </select>
      )}
      {models.isError && (
        <span role="status" className="text-text-secondary text-xs">
          {localize('com_codechat_model_unavailable')}
        </span>
      )}
    </div>
  );
}
