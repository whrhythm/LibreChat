import { useContext } from 'react';
import { Button } from '@librechat/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  programmingTask,
  decideProgrammingTask,
  cancelProgrammingTask,
  ProgrammingRequestError,
} from 'librechat-data-provider';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import { newestTask, useTaskStream } from './TaskLive';
import { AuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';

const active = ['queued', 'running', 'awaiting_approval', 'cancelling'];
const commandKeys: Record<
  string,
  | 'com_codechat_command_preparing'
  | 'com_codechat_command_completed'
  | 'com_codechat_command_failed'
> = {
  preparing: 'com_codechat_command_preparing',
  completed: 'com_codechat_command_completed',
  failed: 'com_codechat_command_failed',
};
const statusKeys = {
  queued: 'com_codechat_run_queued',
  running: 'com_codechat_run_running',
  awaiting_approval: 'com_codechat_run_approval',
  cancelling: 'com_codechat_run_cancelling',
  cancelled: 'com_codechat_run_cancelled',
  completed: 'com_codechat_run_completed',
  failed: 'com_codechat_run_failed',
  interrupted: 'com_codechat_run_interrupted',
} as const;

/** Public share views have no auth provider and must never load private task data. */
export default function Task({ id }: { id: string }) {
  const auth = useContext(AuthContext);
  const t = useLocalize();
  if (!auth?.token || !auth.user?.id) return <p>{t('com_codechat_task_private')}</p>;
  return <TaskContent id={id} token={auth.token} userId={auth.user.id} />;
}

export function TaskContent({ id, token, userId }: { id: string; token: string; userId: string }) {
  const t = useLocalize();
  const client = useQueryClient();
  const key = [QueryKeys.programmingTask, userId, id];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const snapshot = await programmingTask(token, id);
      return newestTask(client.getQueryData(key), snapshot);
    },
    staleTime: 30000,
    retry: (count, error) =>
      count < 1 && !(error instanceof ProgrammingRequestError && error.status < 500),
    refetchInterval: (data, current) => {
      const error = current.state.error;
      if (error instanceof ProgrammingRequestError && error.status < 500) return false;
      if (error) return 8000;
      return !data || active.includes(data.status) ? 2000 : false;
    },
  });
  const action = useMutation({
    mutationFn: (value: { operation?: string; decision?: 'approve' | 'reject' }) =>
      value.operation && value.decision
        ? decideProgrammingTask(token, id, value.operation, value.decision)
        : cancelProgrammingTask(token, id),
    onSuccess: (task) => client.setQueryData(key, task),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries(key),
        client.invalidateQueries([QueryKeys.programmingTasks, userId]),
        client.invalidateQueries([QueryKeys.codechatFiles, userId]),
      ]);
    },
    retry: false,
  });
  const task = query.data;
  const pending = task?.pending;
  const approval = task?.events.find(
    (event) => event.kind === 'approval' && event.operation_id === pending?.id,
  );
  const last = task?.events.at(-1);
  const operation =
    last?.kind === 'decision'
      ? task?.events.find(
          (event) => event.kind === 'approval' && event.operation_id === last.operation_id,
        )?.operation
      : last?.operation;
  const final = task?.events.findLast((event) => event.kind === 'finished');
  const running = !!task && active.includes(task.status);
  useTaskStream(id, userId, token, !task || running);
  const answer = task?.events.findLast((event) => event.kind === 'assistant');
  const command = task?.events.findLast((event) => event.kind === 'command_progress');
  const liveCommand =
    command &&
    !task?.events.some(
      (event) => event.kind === 'terminal' && event.operation_id === command.stream_id,
    );
  const queuedAt = task?.events.find((event) => event.kind === 'queued')?.at;
  const queueDelayed = !!queuedAt && query.dataUpdatedAt - Date.parse(queuedAt) >= 30000;
  const visibleSteps = task?.events.filter(
    (event) =>
      !['finished', 'assistant', 'command_progress'].includes(event.kind) &&
      (event.path || event.output),
  );
  let progressKey:
    | 'com_codechat_task_working'
    | 'com_codechat_mcp_running'
    | 'com_codechat_task_command' = 'com_codechat_task_working';
  if (last?.kind === 'mcp_started') progressKey = 'com_codechat_mcp_running';
  else if (last && ['authorized', 'decision'].includes(last.kind) && operation === 'command')
    progressKey = 'com_codechat_task_command';
  let approvalKey:
    | 'com_codechat_task_decided'
    | 'com_codechat_mcp_confirm'
    | 'com_codechat_programming_approval_detail' = 'com_codechat_programming_approval_detail';
  if (pending?.decision) approvalKey = 'com_codechat_task_decided';
  else if (approval?.operation === 'mcp_read' || approval?.operation === 'mcp_write')
    approvalKey = 'com_codechat_mcp_confirm';
  return (
    <section data-testid="programming-task" data-task-id={id} className="my-2 space-y-3">
      <div className="border-border-light space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-text-secondary truncate text-sm">{task?.config.project_path}</span>
          <p role="status" aria-live="polite" className="text-sm font-medium">
            {task
              ? t(statusKeys[task.status as keyof typeof statusKeys] ?? 'com_codechat_run_failed')
              : t(query.isError ? 'com_codechat_task_unavailable' : 'com_ui_loading')}
          </p>
        </div>
        {query.isError && (
          <p role="status" className="text-text-secondary text-sm">
            {t(
              query.error instanceof ProgrammingRequestError && query.error.status < 500
                ? 'com_codechat_task_unavailable'
                : 'com_codechat_task_reconnecting',
            )}
            <Button size="xs" variant="ghost" onClick={() => void query.refetch()}>
              {t('com_codechat_retry')}
            </Button>
          </p>
        )}
        {task?.status === 'queued' && (
          <p className="text-text-secondary text-sm" aria-live="polite">
            {t(
              queueDelayed ? 'com_codechat_task_queue_delayed' : 'com_codechat_task_queue_waiting',
            )}
          </p>
        )}
        {task?.status === 'running' && last && !liveCommand && !answer?.text && (
          <p className="text-text-secondary text-sm">
            {t(last.kind === 'started' ? 'com_codechat_task_model_waiting' : progressKey)}
            {last.path && <span className="ml-2 font-mono">{last.path}</span>}
          </p>
        )}
        {liveCommand && running && (
          <details
            open
            className="bg-surface-secondary rounded-lg p-3"
            data-testid="programming-live-command"
          >
            <summary className="cursor-pointer text-sm">
              {t(commandKeys[command.phase ?? ''] ?? 'com_codechat_task_command')}
            </summary>
            {command.output && (
              <pre className="mt-2 max-h-48 overflow-auto text-xs break-all whitespace-pre-wrap">
                {command.output}
              </pre>
            )}
          </details>
        )}
        {task?.status === 'awaiting_approval' && pending && (
          <div className="bg-surface-secondary space-y-3 rounded-lg p-3">
            <p className="text-sm">{t(approvalKey)}</p>
            <pre className="max-h-52 overflow-auto text-xs break-all whitespace-pre-wrap">
              {JSON.stringify(approval?.arguments ?? {}, null, 2)}
            </pre>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={action.isLoading || !!pending.decision}
                onClick={() => action.mutate({ operation: pending.id, decision: 'approve' })}
              >
                {t('com_codechat_programming_approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={action.isLoading || !!pending.decision}
                onClick={() => action.mutate({ operation: pending.id, decision: 'reject' })}
              >
                {t('com_codechat_programming_reject')}
              </Button>
            </div>
          </div>
        )}
        {!!visibleSteps?.length && (
          <details>
            <summary className="cursor-pointer text-sm">{t('com_codechat_task_steps')}</summary>
            <div className="mt-3 max-h-72 space-y-3 overflow-auto text-xs">
              {visibleSteps.map((event) => (
                <div key={event.sequence}>
                  <time className="text-text-secondary">
                    {new Date(event.at).toLocaleTimeString()}
                  </time>
                  <pre className="break-words whitespace-pre-wrap">
                    {event.path || event.output}
                  </pre>
                  {event.exit_code != null && (
                    <p>{t('com_codechat_programming_exit', { code: event.exit_code })}</p>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
        {running && (
          <Button
            size="xs"
            variant="outline"
            disabled={action.isLoading || task.status === 'cancelling'}
            onClick={() => action.mutate({})}
          >
            {t('com_codechat_programming_stop')}
          </Button>
        )}
        {action.isError && (
          <p role="alert" className="text-sm">
            {t('com_codechat_programming_error')}
          </p>
        )}
      </div>
      {answer?.text && task?.status !== 'completed' && (
        <div data-testid="programming-task-stream" className="prose max-w-none">
          {!running && (
            <p className="text-text-secondary text-xs">{t('com_codechat_answer_partial')}</p>
          )}
          <MarkdownLite content={answer.text} codeExecution={false} />
        </div>
      )}
      {final?.text && !running && (
        <div data-testid="programming-task-result" className="prose max-w-none">
          <MarkdownLite content={final.text} codeExecution={false} />
        </div>
      )}
      {task?.error_code && (
        <p role="alert" className="text-sm">
          {t('com_codechat_programming_failed')} <code>{task.error_code}</code>
        </p>
      )}
    </section>
  );
}
