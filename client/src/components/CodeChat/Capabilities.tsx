import { useCallback, useEffect, useMemo } from 'react';
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
import { useAuthContext } from '~/hooks';

export default function useWorkspaceCapability({
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

  const choose = useCallback(
    (capability: CodeChatCapability, model?: string): boolean => {
      if (!config?.enabled || disabled || !conversation) return false;
      if (model && config.allowedModels && !config.allowedModels.includes(model)) return false;
      setConversation((current) =>
        current && current.conversationId === conversation.conversationId
          ? withCodeChatCapability(current, capability, config, model)
          : current,
      );
      const id = conversation.conversationId;
      if (id && id !== Constants.NEW_CONVO) {
        client.setQueryData<TConversation>([QueryKeys.conversation, id], (cached) =>
          withCodeChatCapability(cached ?? conversation, capability, config, model),
        );
      }
      return true;
    },
    [client, config, conversation, disabled, setConversation],
  );
  return {
    choose,
    endpoint: config?.enabled ? config.endpoint : undefined,
    isCoding:
      !!config?.enabled &&
      conversation?.endpoint === config.endpoint &&
      codechatCapability(conversation, config) === 'coding',
    disabled: disabled || !conversation,
    allowedModels: config?.allowedModels,
  };
}
