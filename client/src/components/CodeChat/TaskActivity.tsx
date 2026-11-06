import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { ProgrammingTask } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

/** An activity indicator is not a claim that the model has produced a result. */
export default function TaskActivity({ task }: { task?: ProgrammingTask }) {
  const t = useLocalize();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const events = task?.events ?? [];
  const latest = events.reduce<(typeof events)[number] | undefined>(
    (found, event) => (!found || Date.parse(event.at) >= Date.parse(found.at) ? event : found),
    undefined,
  );
  const began = events.find((event) => event.kind === 'queued')?.at;
  const elapsed = began ? Math.max(0, Math.floor((now - Date.parse(began)) / 1000)) : 0;
  const quiet = latest ? Math.max(0, Math.floor((now - Date.parse(latest.at)) / 1000)) : 0;
  let label = t('com_codechat_task_model_waiting');
  if (!task) label = t('com_codechat_activity_connecting');
  else if (task.status === 'queued')
    label = t(
      elapsed >= 30 ? 'com_codechat_task_queue_delayed' : 'com_codechat_task_queue_waiting',
    );
  else if (task.status === 'cancelling') label = t('com_codechat_activity_cancelling');
  else if (task.status === 'awaiting_approval') label = t('com_codechat_activity_approval');
  else if (latest?.kind === 'model_progress') {
    if (latest.phase === 'thinking') label = t('com_codechat_activity_thinking');
    else if (latest.phase === 'answering') label = t('com_codechat_activity_answering');
    else label = t('com_codechat_activity_generating');
  } else if (latest?.kind === 'command_progress') {
    if (latest.phase === 'preparing') label = t('com_codechat_command_preparing');
    else if (latest.phase === 'running') label = t('com_codechat_task_command');
  } else if (latest && ['decision', 'authorized'].includes(latest.kind))
    label = t('com_codechat_task_command');
  else if (latest?.kind === 'mcp_started') label = t('com_codechat_mcp_running');
  const waiting = task?.status !== 'awaiting_approval' && task?.status !== 'cancelling';
  const saved = events.findLast((event) => event.kind === 'file' && event.operation === 'write');
  return (
    <div data-testid="programming-activity" className="space-y-2 text-sm">
      <div className="text-text-secondary flex min-h-6 flex-wrap items-center gap-2" role="status">
        {waiting && (
          <LoaderCircle
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        <span className={waiting ? 'shimmer motion-reduce:animate-none' : ''}>{label}</span>
        <span className="text-text-tertiary text-xs tabular-nums" aria-hidden="true">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </span>
      </div>
      {latest?.kind === 'model_progress' &&
        latest.phase === 'preparing_action' &&
        !!latest.characters && (
          <p className="text-text-secondary text-xs">
            {t('com_codechat_activity_characters', { count: latest.characters })}
          </p>
        )}
      {task?.status === 'running' && quiet >= 30 && (
        <p className="text-text-secondary text-xs" data-testid="programming-quiet">
          {t('com_codechat_activity_quiet', { seconds: quiet })}
        </p>
      )}
      {saved?.path && (
        <p className="text-text-secondary truncate text-xs" title={saved.path}>
          {t('com_codechat_activity_saved', { path: saved.path })}
        </p>
      )}
    </div>
  );
}
