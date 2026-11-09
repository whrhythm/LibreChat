import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Label } from '@librechat/client';
import { libraryRequest, QueryKeys } from 'librechat-data-provider';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { useAuthContext, useLocalize } from '~/hooks';

export default function KnowledgeLibraryField() {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const { control } = useFormContext<AgentForm>();
  const agent = useWatch({ control, name: 'agent' });
  const agentId = useWatch({ control, name: 'id' });
  const editable =
    !agentId || (agent?.author === user?.id && !/^agent_[a-f0-9]{32}$/.test(agentId));
  const enabled = editable && user?.provider === 'openid';
  const id = useId();
  const libraries = useQuery({
    queryKey: [QueryKeys.knowledgeLibraries, user?.id],
    queryFn: () => libraryRequest(token!),
    enabled: enabled && !!token,
    retry: false,
  });
  if (!enabled) return null;
  let hint: 'com_agent_library_hint' | 'com_knowledge_loading' | 'com_library_no_libraries' =
    'com_agent_library_hint';
  if (libraries.isLoading) {
    hint = 'com_knowledge_loading';
  } else if (libraries.isSuccess && !libraries.data.libraries.length) {
    hint = 'com_library_no_libraries';
  }

  return (
    <div className="mb-3 space-y-1">
      <Label htmlFor={id} variant="secondary" className="text-2xs font-medium">
        {localize('com_library_title')}
      </Label>
      <Controller
        name="knowledge_library_id"
        control={control}
        render={({ field }) => (
          <select
            {...field}
            id={id}
            value={field.value ?? ''}
            className="border-border-light bg-surface-primary text-text-primary h-9 w-full rounded-lg border px-2 text-sm"
          >
            <option value="">{localize('com_agent_library_none')}</option>
            {field.value && !libraries.data?.libraries.some((item) => item.id === field.value) && (
              <option value={field.value}>{localize('com_agent_library_unavailable')}</option>
            )}
            {libraries.data?.libraries.map((item) => (
              <option key={item.id} value={item.id} disabled={!item.active_revision_id}>
                {item.name}
                {!item.active_revision_id ? ' · ' + localize('com_agent_library_not_ready') : ''}
              </option>
            ))}
          </select>
        )}
      />
      <p className="text-text-secondary text-xs">{localize(hint)}</p>
      {libraries.isError && (
        <div role="alert" className="text-xs">
          {localize('com_knowledge_error')}
          <Button size="xs" variant="ghost" onClick={() => void libraries.refetch()}>
            {localize('com_ui_retry')}
          </Button>
        </div>
      )}
    </div>
  );
}
