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
  generatedToolProposal,
  projectTrials,
  QueryKeys,
} from 'librechat-data-provider';
import type { AITrials, GeneratedToolTask, TMessage } from 'librechat-data-provider';
import { useGetStartupConfig, useProjectQuery } from '~/data-provider';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { useAuthContext, useLocalize } from '~/hooks';
import { projectInspector } from './navigation';
import { authoringContext } from './context';

const proposalPattern = /^```assistant-draft[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
const toolPattern = /^```assistant-tool[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
const builtinPattern = /^```assistant-builtin[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
const buildPattern = /^```assistant-tool-build[ \t]*\r?\n([\s\S]{1,8192}?)\r?\n```[ \t]*$/gm;

function buildProposal(text: string) {
  const matches = Array.from(text.matchAll(buildPattern));
  if (matches.length !== 1) return;
  try {
    const candidate = generatedToolProposal.safeParse(JSON.parse(matches[0][1]));
    if (candidate.success) return candidate.data;
  } catch {
    // Assistant text may contain an incomplete or invalid JSON block.
  }
}

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
  const [review, setReview] = useState<{
    instructions: string;
    toolReference: string | null;
    calculator?: boolean;
    draft: AITrials;
  } | null>(null);
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
  const finished =
    latest &&
    latest.conversationId === conversationId &&
    !latest.isCreatedByUser &&
    !latest.error &&
    !latest.unfinished &&
    !latest.isTemporary &&
    !busy;
  const source = messages?.find(
    (message) => message.isCreatedByUser && message.messageId === latest?.parentMessageId,
  );
  const base =
    source && /^\[starbridge-draft:(new|[a-f0-9]{64})\]$/m.exec(getSpeechText(source))?.[1];
  const requestId =
    finished && base && /^[a-f0-9-]{36}$/.test(latest.messageId) ? latest.messageId : null;
  const candidate = requestId && latest ? buildProposal(getSpeechText(latest)) : null;
  const buildKey = [...key, 'generated-tool', requestId];
  const buildPath = '/generated-tools/' + requestId;
  const build = useQuery({
    queryKey: buildKey,
    queryFn: () => projectTrials<GeneratedToolTask>(token!, id!, buildPath),
    enabled: !!enabled && !!linked && !!candidate,
    retry: false,
    refetchInterval: (task) =>
      task &&
      (['queued', 'running', 'awaiting_approval', 'cancelling'].includes(task.status) ||
        task.review?.state === 'pending')
        ? 2500
        : false,
    onSuccess: (task) => {
      if (task.review?.state === 'approved') void cache.invalidateQueries(key, { exact: true });
    },
  });
  const generate = useMutation({
    mutationFn: (operation: 'start' | 'review') =>
      operation === 'start'
        ? projectTrials<GeneratedToolTask>(token!, id!, '/generated-tools', {
            ...candidate!,
            request_id: requestId,
          })
        : projectTrials<GeneratedToolTask>(token!, id!, buildPath, {}),
    onSuccess: (task) => cache.setQueryData(buildKey, task),
  });
  const save = useMutation({
    mutationFn: async ({
      instructions,
      toolReference,
      calculator,
      draft,
    }: NonNullable<typeof review>) => {
      if (!id || !token) throw new AITrialError('ai_trials_unavailable');
      const selection = {
        instructions,
        tool_reference: toolReference,
        ...(calculator == null ? {} : { calculator_enabled: calculator }),
      };
      const result =
        draft.config && draft.digest
          ? await projectTrials(token, id, '/update', {
              config: { ...draft.config, ...selection },
              expected_digest: draft.digest,
            })
          : await projectTrials(token, id, '/initialize', {
              ...selection,
              expected_knowledge_revision_id: draft.knowledge_revision_id,
            });
      if (
        result.config?.instructions !== instructions ||
        (result.config.tool_reference ?? null) !== toolReference ||
        result.knowledge_revision_id !== draft.knowledge_revision_id ||
        Boolean(result.config.calculator_enabled) !== Boolean(calculator)
      )
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
  const tools = current.data.available_tools ?? [];
  const choices = latest ? Array.from(getSpeechText(latest).matchAll(toolPattern)) : [];
  const requested = choices[0]?.[1].trim();
  const builtinChoices = latest ? Array.from(getSpeechText(latest).matchAll(builtinPattern)) : [];
  const builtin = builtinChoices[0]?.[1].trim();
  const calculator =
    builtin == null ? current.data.config?.calculator_enabled : builtin === 'calculator';
  const approved = build.data?.review?.state === 'approved' ? build.data.review.reference : null;
  const toolReference =
    approved ??
    (requested === 'none' ? null : (requested ?? current.data.config?.tool_reference ?? null));
  const invalidTool =
    choices.length > 1 ||
    builtinChoices.length > 1 ||
    (builtin != null && builtin !== 'none' && builtin !== 'calculator') ||
    (calculator === true && !current.data.available_builtin_tools?.includes('calculator')) ||
    (requested != null &&
      requested !== 'none' &&
      !tools.some((tool) => tool.reference === requested));
  const reviewedTool = tools.find((tool) => tool.reference === review?.toolReference);
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
              '\n' +
              t('com_project_authoring_tool_prompt') +
              '\n' +
              t('com_project_tool_build_prompt') +
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
      {canReview && !outdated && invalidTool && (
        <span role="alert">{t('com_project_tool_unavailable')}</span>
      )}
      {candidate && !outdated && (
        <div className="border-border-light w-full rounded-md border p-2 text-xs">
          <details>
            <summary className="cursor-pointer font-medium">{candidate.title}</summary>
            <p className="mt-2">{candidate.requirements}</p>
            <p className="mt-1">{t('com_project_tool_build_scope')}</p>
            <pre className="mt-1 overflow-x-auto">{JSON.stringify(candidate.cases, null, 2)}</pre>
          </details>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!build.data && (
              <Button
                size="xs"
                disabled={generate.isLoading || build.isFetching}
                onClick={() => generate.mutate('start')}
              >
                {t('com_project_tool_build_start')}
              </Button>
            )}
            {build.data && !build.data.review && build.data.status !== 'completed' && (
              <span role="status">
                {t(
                  ['queued', 'running', 'awaiting_approval', 'cancelling'].includes(
                    build.data.status,
                  )
                    ? 'com_project_tool_build_running'
                    : 'com_project_tool_build_failed',
                )}
              </span>
            )}
            {build.data?.status === 'completed' && !build.data.review && (
              <Button
                size="xs"
                disabled={generate.isLoading}
                onClick={() => generate.mutate('review')}
              >
                {t('com_project_tool_build_review')}
              </Button>
            )}
            {build.data?.review && (
              <span role="status">{t(`com_releases_tool_${build.data.review.state}`)}</span>
            )}
            {build.data?.review?.state === 'pending' && (
              <Button size="xs" variant="ghost" onClick={() => void build.refetch()}>
                {t('com_releases_refresh')}
              </Button>
            )}
            {generate.isError && <span role="alert">{t('com_project_tool_build_failed')}</span>}
          </div>
        </div>
      )}
      {canReview && !outdated && !invalidTool && (!candidate || !!approved) && (
        <Button
          ref={trigger}
          size="xs"
          disabled={busy}
          onClick={() => {
            save.reset();
            setReview({ instructions: proposal, toolReference, calculator, draft: current.data });
          }}
        >
          {t(candidate ? 'com_project_tool_build_authorize' : 'com_project_authoring_review')}
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
              <pre className="border-border-light bg-surface-secondary max-h-64 overflow-auto rounded border p-2 text-sm whitespace-pre-wrap">
                {review.instructions}
              </pre>
              {reviewedTool && (
                <p className="text-sm font-medium">
                  {reviewedTool.service} / {reviewedTool.name}
                </p>
              )}
              {reviewedTool && (
                <p className="text-text-secondary text-xs">
                  {reviewedTool.reference.startsWith('action:')
                    ? ''
                    : t('com_project_tool_disclosure') + ' '}
                  {reviewedTool.data_notice}
                </p>
              )}
              {review.calculator && <p className="text-sm">{t('com_project_calculator')}</p>}
              {review.draft.knowledge_revision_id && (
                <p className="text-sm">{t('com_project_fixed_knowledge')}</p>
              )}
              {save.isError && (
                <p role="alert">
                  {t(
                    save.error instanceof AITrialError
                      ? authoringError(save.error.code)
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
                <Button
                  type="submit"
                  disabled={
                    save.isLoading ||
                    !review.instructions.trim() ||
                    (!!review.toolReference && !reviewedTool) ||
                    (!!review.calculator &&
                      !current.data.available_builtin_tools?.includes('calculator'))
                  }
                >
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

function authoringError(code: string) {
  if (code === 'ai_trials_draft_changed') return 'com_trials_changed';
  if (code === 'ai_trials_tool_unavailable') return 'com_project_tool_unavailable';
  return 'com_trials_error';
}
