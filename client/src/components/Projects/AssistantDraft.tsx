import { useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogDescription,
  OGDialogTitle,
} from '@librechat/client';
import {
  aiProjects,
  AITrialError,
  getSpeechText,
  projectTrials,
  QueryKeys,
} from 'librechat-data-provider';
import type { AITrials, TMessage } from 'librechat-data-provider';
import { useGetStartupConfig, useProjectQuery } from '~/data-provider';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { useAuthContext, useLocalize } from '~/hooks';
import { projectInspector } from './navigation';
import { authoringContext } from './context';

const proposalPattern = /^```assistant-draft[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;

export default function AssistantDraft({
  projectId,
  conversationId,
  messages,
  busy,
  insertPrompt,
}: {
  projectId: string;
  conversationId?: string;
  messages: TMessage[] | null;
  busy: boolean;
  insertPrompt: (instruction: string) => void;
}) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const cache = useQueryClient();
  const { data: startup } = useGetStartupConfig();
  const latest = useLatestMessage(0, conversationId);
  const trigger = useRef<HTMLButtonElement>(null);
  const [review, setReview] = useState<{ instructions: string; draft: AITrials } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const select = useSetAtom(projectInspector(user?.id ?? 'anonymous'));
  const enabled = !!token && !!startup?.aiTrialsEnabled && window.self === window.top;
  const { data: project } = useProjectQuery(projectId, { enabled, retry: false });
  const id = project?.platformProjectId;
  const projects = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id],
    queryFn: () => aiProjects(token!),
    enabled: enabled && !!id,
  });
  const linked = projects.data?.projects.some(
    (item) => item.project.id === id && item.state === 'ready',
  );
  const key = [QueryKeys.aiProjects, user?.id, id, 'trials'];
  const current = useQuery({
    queryKey: key,
    queryFn: () => projectTrials(token!, id!),
    enabled: enabled && !!id && !!linked,
  });
  const save = useMutation({
    mutationFn: async ({ instructions, draft }: NonNullable<typeof review>) => {
      if (!id || !token) throw new AITrialError('ai_trials_unavailable');
      const result =
        draft.config && draft.digest
          ? await projectTrials(token, id, '/update', {
              config: { ...draft.config, instructions },
              expected_digest: draft.digest,
            })
          : await projectTrials(token, id, '/initialize', { instructions });
      if (result.config?.instructions !== instructions)
        throw new AITrialError('ai_trials_draft_changed');
      return result;
    },
    onSuccess: (result) => {
      cache.setQueryData(key, result);
      setSaved(latest?.messageId ?? null);
      setReview(null);
      select({ projectId, section: 'assistant' });
    },
    onSettled: () => void cache.invalidateQueries(key),
  });
  if (!enabled || !linked || !current.data || (current.data.config && !current.data.digest))
    return null;
  const proposals =
    latest &&
    latest.conversationId === conversationId &&
    !latest.isCreatedByUser &&
    !latest.error &&
    !latest.unfinished &&
    !latest.isTemporary
      ? Array.from(getSpeechText(latest).matchAll(proposalPattern))
      : [];
  const proposal = proposals.length === 1 ? proposals[0][1].trim() : '';
  const source = messages?.find(
    (message) => message.isCreatedByUser && message.messageId === latest?.parentMessageId,
  );
  const base =
    source && /^\[starbridge-draft:(new|[a-f0-9]{64})\]$/m.exec(getSpeechText(source))?.[1];
  const canReview =
    !!base && proposal.length > 0 && proposal.length <= 32000 && saved !== latest?.messageId;
  const outdated = canReview && base !== (current.data.digest ?? 'new');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 px-4 pb-1">
      <Button
        size="xs"
        variant="outline"
        disabled={busy || current.isFetching}
        onClick={async () => {
          const { data, isSuccess } = await current.refetch();
          if (!isSuccess || !data || (data.config && !data.digest)) return;
          const context = authoringContext(data);
          insertPrompt(
            '[starbridge-draft:' +
              (data.digest ?? 'new') +
              ']\n' +
              t('com_project_authoring_prompt') +
              '\n\n' +
              t('com_project_authoring_current') +
              '\n' +
              JSON.stringify(context, null, 2) +
              '\n\n' +
              t('com_project_authoring_request') +
              '\n',
          );
        }}
      >
        {t(current.data.config ? 'com_project_authoring_edit' : 'com_project_authoring_create')}
      </Button>
      {outdated && <span role="status">{t('com_trials_changed')}</span>}
      {canReview && !outdated && (
        <Button
          ref={trigger}
          size="xs"
          disabled={busy}
          onClick={() => {
            save.reset();
            setReview({ instructions: proposal, draft: current.data });
          }}
        >
          {t('com_project_authoring_review')}
        </Button>
      )}
      {saved && saved === latest?.messageId && (
        <span role="status">{t('com_project_authoring_saved')}</span>
      )}
      <OGDialog
        open={review !== null}
        triggerRef={trigger}
        onOpenChange={(open) => {
          if (!open && !save.isLoading) setReview(null);
        }}
      >
        <OGDialogContent placement="center" className="max-h-[90dvh] overflow-y-auto">
          <OGDialogTitle>{t('com_project_authoring_review')}</OGDialogTitle>
          <OGDialogDescription>{t('com_project_authoring_hint')}</OGDialogDescription>
          {review && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate({ ...review, instructions: review.instructions.trim() });
              }}
            >
              <textarea
                rows={10}
                maxLength={32000}
                required
                disabled={save.isLoading}
                className="border-border-light bg-surface-primary w-full rounded border p-2 text-sm"
                aria-label={t('com_trials_instructions')}
                value={review.instructions}
                onChange={(event) => setReview({ ...review, instructions: event.target.value })}
              />
              {save.isError && (
                <p role="alert">
                  {t(
                    save.error instanceof AITrialError &&
                      save.error.code === 'ai_trials_draft_changed'
                      ? 'com_trials_changed'
                      : 'com_trials_error',
                  )}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isLoading}
                  onClick={() => setReview(null)}
                >
                  {t('com_ui_cancel')}
                </Button>
                <Button type="submit" disabled={save.isLoading || !review.instructions.trim()}>
                  {t('com_trials_save')}
                </Button>
              </div>
            </form>
          )}
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
