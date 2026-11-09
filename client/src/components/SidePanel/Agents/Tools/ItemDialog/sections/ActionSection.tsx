import { useEffect } from 'react';
import { Button } from '@librechat/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { actionDelimiter, dataService, QueryKeys } from 'librechat-data-provider';
import type { ActionItem } from '../../items/types';
import { useGetExpandedAgentByIdQuery } from '~/data-provider';
import ActionBackground from '../../../Actions/Background';
import { useAgentPanelContext } from '~/Providers';
import { NEW_ACTION_ID } from '../../items/types';
import ActionEditor from '../../ActionEditor';
import { isEphemeralAgent } from '~/common';
import { useLocalize } from '~/hooks';

interface Props {
  item: ActionItem;
  agentId: string;
  onClose: () => void;
}

function ReusableActionSection({ item, agentId, onClose }: Props) {
  const localize = useLocalize();
  const client = useQueryClient();
  const { data: agent } = useGetExpandedAgentByIdQuery(agentId, { enabled: false });
  const attached = (agent?.actions ?? []).some(
    (reference) => reference.split(actionDelimiter)[1] === item.id,
  );
  const binding = useMutation({
    mutationFn: () => dataService.setAgentActionBinding(agentId, item.id, !attached),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries([QueryKeys.actions]),
        client.invalidateQueries([QueryKeys.agent, agentId]),
      ]);
      onClose();
    },
  });
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-text-secondary text-sm">{localize('com_ui_action_personal')}</p>
      {!agent || isEphemeralAgent(agentId) ? (
        <p className="text-text-secondary text-sm">{localize('com_agents_no_agent_id_error')}</p>
      ) : (
        <Button disabled={binding.isLoading} onClick={() => binding.mutate()}>
          {localize(attached ? 'com_ui_action_detach' : 'com_ui_action_attach')}
        </Button>
      )}
      {binding.isError && <p role="alert">{localize('com_ui_action_binding_failed')}</p>}
    </div>
  );
}

function LegacyActionSection({ item, agentId, onClose }: Props) {
  const { setAction } = useAgentPanelContext();
  const isCreate = item.id === NEW_ACTION_ID;

  useEffect(() => {
    setAction(isCreate ? undefined : item.action);
    return () => setAction(undefined);
  }, [isCreate, item.action, setAction]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {!isCreate && <ActionBackground agentId={agentId} />}
      <ActionEditor
        agentId={agentId}
        onClose={onClose}
        onDeleted={onClose}
        onCreated={isCreate ? onClose : undefined}
      />
    </div>
  );
}

export default function ActionSection(props: Props) {
  const action = props.item.action;
  if (action && (action.reusable || action.agent_id !== props.agentId)) {
    return <ReusableActionSection {...props} />;
  }
  return <LegacyActionSection {...props} />;
}
