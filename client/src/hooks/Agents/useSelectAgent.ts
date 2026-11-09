import { useCallback } from 'react';
import { Constants, EModelEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TConversation, TPreset } from 'librechat-data-provider';
import useGetConversation from '~/hooks/Conversations/useGetConversation';
import useDefaultConvo from '~/hooks/Conversations/useDefaultConvo';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import { logger, specDisplayFieldReset } from '~/utils';
import useNewConvo from '~/hooks/useNewConvo';

export default function useSelectAgent() {
  const agentsMap = useAgentsMapContext();
  const getDefaultConversation = useDefaultConvo();
  const { newConversation } = useNewConvo();
  const getConversation = useGetConversation(0);

  const onSelect = useCallback(
    (value: string) => {
      const agent = agentsMap?.[value];
      if (!agent) return;

      const template: Partial<TPreset | TConversation> = {
        endpoint: EModelEndpoint.agents,
        agent_id: agent.id,
        conversationId: Constants.NEW_CONVO as string,
        codeEnvironmentMode: undefined,
        codeWorkspaces: undefined,
        ...specDisplayFieldReset,
      };

      // Agent details hydrate through the existing query. Starting another
      // conversation when they arrive would clear a first turn already streaming.
      const conversation = getConversation();
      logger.log('conversation', 'Updating conversation with agent', agent);
      if (isAssistantsEndpoint(conversation?.endpoint)) {
        newConversation({
          template: { ...(template as Partial<TConversation>) },
          preset: template as Partial<TPreset>,
        });
        return;
      }
      const switchesAgent = conversation?.agent_id !== agent.id;
      const resolvedConvo = getDefaultConversation({
        conversation: {
          ...(conversation ?? {}),
          agent_id: agent.id,
          codeEnvironmentMode: switchesAgent ? undefined : conversation?.codeEnvironmentMode,
          codeWorkspaces: switchesAgent ? undefined : conversation?.codeWorkspaces,
          ...specDisplayFieldReset,
        },
        preset: template,
      });
      const currentConvo = {
        ...resolvedConvo,
        codeEnvironmentMode: switchesAgent ? undefined : conversation?.codeEnvironmentMode,
        codeWorkspaces: switchesAgent ? undefined : conversation?.codeWorkspaces,
      };
      newConversation({
        template: currentConvo,
        preset: template as Partial<TPreset>,
      });
    },
    [agentsMap, getConversation, getDefaultConversation, newConversation],
  );

  return { onSelect };
}
