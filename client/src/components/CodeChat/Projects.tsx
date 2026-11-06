import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { FolderOpen, Pencil, Plus, RefreshCw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  workspaceProjects,
  workspaceProject,
  workspaceProjectSource,
  saveWorkspaceProject,
  ProjectRequestError,
} from 'librechat-data-provider';
import type { WorkspaceProjectInput } from 'librechat-data-provider';
import { TemplateCreate, TemplateProject } from './Templates';
import { useAuthContext, useLocalize } from '~/hooks';
import { deliveryState } from './delivery';
import Delivery from './Delivery';

type Props = {
  enabled: boolean;
  path: string;
  onOpen: (pane: 'files' | 'apps', path: string) => void;
};
const statusKeys: Record<
  string,
  | 'com_codechat_run_running'
  | 'com_codechat_run_completed'
  | 'com_codechat_run_failed'
  | 'com_codechat_run_queued'
  | 'com_codechat_run_approval'
  | 'com_codechat_run_cancelled'
> = {
  running: 'com_codechat_run_running',
  completed: 'com_codechat_run_completed',
  failed: 'com_codechat_run_failed',
  queued: 'com_codechat_run_queued',
  awaiting_approval: 'com_codechat_run_approval',
  cancelled: 'com_codechat_run_cancelled',
};

export default function Projects({ enabled, path, onOpen }: Props) {
  const t = useLocalize();
  const { user, token } = useAuthContext();
  const client = useQueryClient();
  const state = useMemo(
    () => atom({ selected: '', draft: null as WorkspaceProjectInput | null }),
    [],
  );
  const [view, setView] = useAtom(state);
  const list = useQuery({
    queryKey: [QueryKeys.workspaceProjects, user?.id],
    queryFn: () => workspaceProjects(token!),
    enabled: enabled && !!token,
    retry: false,
  });
  const selected = view.selected || list.data?.projects[0]?.id || '';
  const context = useQuery({
    queryKey: [QueryKeys.workspaceProject, user?.id, selected],
    queryFn: () => workspaceProject(token!, selected),
    enabled: enabled && !!token && !!selected,
    retry: false,
    refetchInterval: enabled && selected ? 15000 : false,
  });
  const source = useQuery({
    queryKey: [QueryKeys.workspaceProjectSource, user?.id, selected],
    queryFn: () => workspaceProjectSource(token!, selected),
    enabled: false,
    retry: false,
  });
  const save = useMutation({
    mutationKey: [QueryKeys.workspaceProjects, user?.id],
    mutationFn: (value: WorkspaceProjectInput) => saveWorkspaceProject(token!, value),
    onSuccess: (project) => {
      setView({ selected: project.id, draft: null });
      void client.invalidateQueries([QueryKeys.workspaceProjects, user?.id]);
      void client.invalidateQueries([QueryKeys.workspaceProject, user?.id, project.id]);
    },
    retry: false,
  });
  const draft = view.draft;
  const current = context.data;
  function comparisonLabel() {
    if (source.isError) return 'com_codechat_project_check_error';
    if (
      !source.data ||
      (current?.application?.release &&
        source.data.release_revision !== current.application.release.revision)
    )
      return 'com_codechat_project_unchecked';
    if (source.data.state === 'same') return 'com_codechat_project_same';
    if (source.data.state === 'changed') return 'com_codechat_project_changed';
    return 'com_codechat_project_unbound';
  }
  const inputStyle =
    'border-border-light bg-surface-primary text-text-primary w-full rounded border px-2 py-1.5 text-sm';
  const edit = (value: WorkspaceProjectInput) => {
    save.reset();
    setView((old) => ({ ...old, draft: value }));
  };
  const change = (patch: Partial<WorkspaceProjectInput>) =>
    setView((old) => ({ ...old, draft: old.draft ? { ...old.draft, ...patch } : null }));
  return (
    <div className="space-y-3" data-testid="personal-projects">
      <TemplateCreate
        enabled={enabled}
        onCreated={(project) => setView({ selected: project.id, draft: null })}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-text-secondary text-xs">{t('com_codechat_projects_hint')}</p>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('com_codechat_project_associate')}
          disabled={!!draft}
          onClick={() => edit({ path, name: path.split('/').at(-1) || '', goal: '', revision: 0 })}
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {list.isLoading && enabled && <p role="status">{t('com_ui_loading')}</p>}
      {list.isError && (
        <p role="alert">
          {t('com_codechat_projects_error')}{' '}
          <Button size="xs" variant="ghost" onClick={() => void list.refetch()}>
            {t('com_codechat_retry')}
          </Button>
        </p>
      )}
      {!draft && list.isSuccess && !list.data.projects.length && (
        <div className="border-border-light space-y-2 rounded-lg border p-3">
          <p>{t('com_codechat_projects_empty')}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              edit({ path, name: path.split('/').at(-1) || '', goal: '', revision: 0 })
            }
          >
            {t('com_codechat_project_associate')}
          </Button>
        </div>
      )}
      {draft && (
        <form
          className="border-border-light space-y-3 rounded-lg border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(draft);
          }}
        >
          <p className="font-medium">
            {t(draft.revision ? 'com_codechat_project_edit' : 'com_codechat_project_associate')}
          </p>
          <p className="text-text-secondary text-xs">{t('com_codechat_project_preserve')}</p>
          <label className="block space-y-1">
            {t('com_codechat_project_path')}
            <input
              className={inputStyle}
              value={draft.path}
              required
              maxLength={255}
              disabled={draft.revision > 0 || save.isLoading}
              onChange={(event) => change({ path: event.target.value })}
            />
          </label>
          <label className="block space-y-1">
            {t('com_codechat_project_name')}
            <input
              className={inputStyle}
              value={draft.name}
              required
              maxLength={80}
              disabled={save.isLoading}
              onChange={(event) => change({ name: event.target.value })}
            />
          </label>
          <label className="block space-y-1">
            {t('com_codechat_project_goal')}
            <textarea
              className={inputStyle}
              rows={3}
              value={draft.goal}
              maxLength={1000}
              disabled={save.isLoading}
              onChange={(event) => change({ goal: event.target.value })}
            />
          </label>
          {save.isError && (
            <p role="alert">
              {t(
                save.error instanceof ProjectRequestError && save.error.code === 'projects_changed'
                  ? 'com_codechat_project_conflict'
                  : 'com_codechat_project_save_error',
              )}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={save.isLoading}
              onClick={() => setView((old) => ({ ...old, draft: null }))}
            >
              {t('com_ui_cancel')}
            </Button>
            <Button size="sm" type="submit" disabled={save.isLoading}>
              {t('com_ui_save')}
            </Button>
          </div>
        </form>
      )}
      {!draft && !!list.data?.projects.length && (
        <>
          <label className="block space-y-1 text-xs">
            {t('com_codechat_project_current')}
            <select
              className={inputStyle}
              value={selected}
              onChange={(event) => setView({ selected: event.target.value, draft: null })}
            >
              {list.data.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          {context.isLoading && <p role="status">{t('com_ui_loading')}</p>}
          {context.isError && (
            <p role="alert">
              {t('com_codechat_projects_error')}{' '}
              <Button size="xs" variant="ghost" onClick={() => void context.refetch()}>
                {t('com_codechat_retry')}
              </Button>
            </p>
          )}
          {current && (
            <>
              <TemplateProject
                key={selected}
                projectId={selected}
                enabled={enabled}
                onApps={() => onOpen('apps', current.path)}
              />
              <div className="border-border-light space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-semibold" title={current.name}>
                    {current.name}
                  </h3>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('com_codechat_project_edit')}
                    onClick={() =>
                      edit({
                        path: current.path,
                        name: current.name,
                        goal: current.goal,
                        revision: current.revision,
                      })
                    }
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
                <p className="text-text-secondary text-xs break-all">{current.path}</p>
                <p className="break-words whitespace-pre-wrap">
                  {current.goal || t('com_codechat_project_no_goal')}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button size="xs" variant="outline" onClick={() => onOpen('files', current.path)}>
                    <FolderOpen className="size-3.5" aria-hidden="true" />
                    {t('com_codechat_project_files')}
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => onOpen('apps', current.path)}>
                    {t('com_codechat_project_apps')}
                  </Button>
                </div>
              </div>
              <section className="border-border-light space-y-2 rounded-lg border p-3">
                <h3 className="font-medium">{t('com_codechat_project_release')}</h3>
                <p className="text-xs">
                  {current.application
                    ? t(deliveryState(current.application))
                    : t('com_codechat_project_unpublished')}
                </p>
                {current.application && (
                  <Delivery app={current.application} stale={context.isError} />
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs">{t('com_codechat_project_draft')}</span>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={source.isFetching}
                    onClick={() => void source.refetch()}
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    {t('com_codechat_project_check')}
                  </Button>
                </div>
                <p className="text-text-secondary text-xs" role="status">
                  {t(comparisonLabel())}
                </p>
                {source.data && (
                  <p className="text-text-secondary text-xs">
                    {t('com_codechat_project_checked_at', {
                      time: new Date(source.data.observed_at).toLocaleString(),
                    })}
                  </p>
                )}
              </section>
              <section className="space-y-2">
                <h3 className="font-medium">{t('com_codechat_project_conversations')}</h3>
                <p className="text-text-secondary text-xs">
                  {t('com_codechat_project_context_help')}
                </p>
                {!current.tasks.length && (
                  <p className="text-xs">{t('com_codechat_project_no_tasks')}</p>
                )}
                <ol className="space-y-2">
                  {current.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="border-border-light space-y-1 rounded-lg border p-3"
                    >
                      <p className="line-clamp-3 text-xs break-words">
                        {task.title || t('com_codechat_project_legacy_task')}
                      </p>
                      <p className="text-text-secondary text-xs">
                        {t(statusKeys[task.status] ?? 'com_codechat_project_other_status')} ·{' '}
                        {new Date(task.created_at).toLocaleString()}
                      </p>
                      <p className="text-xs">
                        {task.acceptance.total
                          ? t('com_codechat_project_task_checks', {
                              passed: task.acceptance.passed,
                              total: task.acceptance.total,
                              pending: task.acceptance.pending,
                              changes: task.acceptance.changes_requested,
                            })
                          : t('com_codechat_project_no_checks')}
                      </p>
                      {/^[0-9a-f-]{36}$/.test(task.conversation_id) && (
                        <a
                          className="inline-block text-xs underline"
                          href={'/c/' + encodeURIComponent(task.conversation_id)}
                        >
                          {t('com_codechat_project_continue')}
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
                {current.tasks_truncated && (
                  <p className="text-text-secondary text-xs">
                    {t('com_codechat_project_recent_limit')}
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
