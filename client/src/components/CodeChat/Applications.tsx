import { useId, useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { MenuButton } from '@ariakit/react';
import { Ellipsis, ExternalLink, ScrollText, Rocket } from 'lucide-react';
import { Button, Chip, DropdownPopup, Progress } from '@librechat/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { personalApplicationRequest, QueryKeys } from 'librechat-data-provider';
import type { PersonalApplication } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { storageSize } from './storage';

function ApplicationMenu({
  disabled,
  stopped,
  hasImage,
  onToggle,
  onDelete,
}: {
  disabled: boolean;
  stopped: boolean;
  hasImage: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useLocalize();
  const id = useId();
  const openAtom = useMemo(() => atom(false), []);
  const [open, setOpen] = useAtom(openAtom);
  return (
    <DropdownPopup
      portal
      menuId={id}
      isOpen={open}
      setIsOpen={setOpen}
      items={[
        ...(hasImage
          ? [
              {
                id: 'toggle',
                label: t(stopped ? 'com_codechat_app_start' : 'com_codechat_app_stop'),
                onClick: onToggle,
              },
            ]
          : []),
        { id: 'delete', label: t('com_codechat_app_remove'), onClick: onDelete },
      ]}
      trigger={
        <MenuButton
          aria-label={t('com_codechat_app_actions')}
          disabled={disabled}
          render={<Button variant="ghost" size="icon-sm" />}
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </MenuButton>
      }
    />
  );
}

const statusKeys = {
  queued: 'com_codechat_app_queued',
  preparing: 'com_codechat_app_preparing',
  building: 'com_codechat_app_building',
  deploying: 'com_codechat_app_deploying',
  changing: 'com_codechat_app_changing',
  running: 'com_codechat_app_running',
  stopped: 'com_codechat_app_stopped',
  failed: 'com_codechat_app_failed',
  deleted: 'com_codechat_app_deleted',
} as const;

function failureKey(code: string) {
  if (code === 'build_storage_exhausted') return 'com_codechat_app_build_storage';
  if (code === 'build_memory_exhausted') return 'com_codechat_app_build_memory';
  if (code === 'build_timed_out') return 'com_codechat_app_build_timeout';
  if (code === 'build_failed') return 'com_codechat_app_build_failed';
  if (code === 'application_start_failed') return 'com_codechat_app_start_failed';
  if (code === 'pushed_image_verify_failed') return 'com_codechat_app_image_failed';
  return 'com_codechat_app_failed_detail';
}

function statusTone(status: string, busy: boolean) {
  if (status === 'running') return 'success';
  if (status === 'failed') return 'error';
  return busy ? 'info' : 'neutral';
}

export default function Applications({
  path,
  canPublish,
  enabled,
}: {
  path: string;
  canPublish: boolean;
  enabled: boolean;
}) {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const client = useQueryClient();
  const deleteAtom = useMemo(() => atom<string | null>(null), []);
  const logsAtom = useMemo(() => atom<string | null>(null), []);
  const [deleteId, setDeleteId] = useAtom(deleteAtom);
  const [logsId, setLogsId] = useAtom(logsAtom);
  const apps = useQuery<{ apps: PersonalApplication[] }>({
    queryKey: [QueryKeys.codechatApps, user?.id],
    queryFn: async () => (await personalApplicationRequest(token!, 'list')).json(),
    enabled: enabled && !!token && !!user?.id,
    refetchInterval: enabled ? 5000 : false,
    retry: false,
  });
  const operation = useMutation({
    mutationFn: ({
      action,
      value,
    }: {
      action: 'publish' | 'start' | 'stop' | 'delete';
      value: string;
    }) => personalApplicationRequest(token!, action, value),
    onSuccess: () => {
      setDeleteId(null);
      void client.invalidateQueries([QueryKeys.codechatApps, user?.id]);
    },
    retry: false,
  });
  const pending = apps.data?.apps?.some(
    (app) =>
      app.project_path === path &&
      ['queued', 'preparing', 'building', 'deploying', 'changing'].includes(app.status),
  );
  return (
    <section className="flex flex-col gap-3 pt-2" aria-label={localize('com_codechat_apps')}>
      {canPublish && path && (
        <Button
          variant="default"
          disabled={operation.isLoading || pending}
          onClick={() => operation.mutate({ action: 'publish', value: path })}
        >
          <Rocket className="size-4" aria-hidden="true" />
          {localize('com_codechat_app_publish')}
        </Button>
      )}
      {apps.isSuccess && !apps.data.apps.some((app) => app.status !== 'deleted') && (
        <p className="text-text-secondary py-6 text-center text-sm">
          {localize('com_codechat_apps_empty')}
        </p>
      )}
      {apps.isLoading && <p role="status">{localize('com_ui_loading')}</p>}
      {(apps.isError || operation.isError) && (
        <div role="alert">
          <p>{localize('com_codechat_app_error')}</p>
          <Button variant="ghost" onClick={() => void apps.refetch()}>
            {localize('com_codechat_retry')}
          </Button>
        </div>
      )}
      {apps.data?.apps
        ?.filter((app) => app.status !== 'deleted')
        .map((app) => {
          const busy = ['queued', 'preparing', 'building', 'deploying', 'changing'].includes(
            app.status,
          );
          const metrics = app.observation?.metrics;
          return (
            <article
              key={app.id}
              className="border-border-light flex min-w-0 flex-col gap-3 rounded-xl border p-3"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="min-w-0 truncate pt-1 text-sm font-semibold" title={app.project_path}>
                  {app.project_path}
                </p>
                <Chip role="status" className="shrink-0" tone={statusTone(app.status, busy)}>
                  {localize(
                    statusKeys[app.status as keyof typeof statusKeys] ??
                      'com_codechat_app_preparing',
                  )}
                </Chip>
              </div>
              {app.error_code && (
                <p role="alert" className="text-xs">
                  {localize(failureKey(app.error_code))}
                </p>
              )}
              {app.status === 'failed' && (
                <>
                  <p className="text-xs">
                    {localize(
                      app.previous_url
                        ? 'com_codechat_app_update_failed'
                        : 'com_codechat_app_failure_retained',
                    )}
                  </p>
                  {app.cleanup && (
                    <p role="status" className="text-xs">
                      {localize(
                        app.cleanup.status === 'complete'
                          ? 'com_codechat_app_cleanup_complete'
                          : 'com_codechat_app_cleanup_pending',
                      )}
                    </p>
                  )}
                  {app.previous_url && (
                    <a
                      className="text-sm underline"
                      href={app.previous_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {localize('com_codechat_app_previous_release')}
                    </a>
                  )}
                  <Button
                    variant="outline"
                    disabled={
                      operation.isLoading ||
                      app.cleanup?.status !== 'complete' ||
                      !!app.error_code?.includes('requires_review')
                    }
                    onClick={() => operation.mutate({ action: 'publish', value: app.project_path })}
                  >
                    {localize('com_codechat_app_retry_publish')}
                  </Button>
                </>
              )}
              {app.url && app.status === 'running' && (
                <a
                  className="text-text-secondary hover:text-text-primary flex min-w-0 items-center gap-2 text-xs underline-offset-4 hover:underline"
                  href={app.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={localize('com_codechat_app_open')}
                  title={app.url}
                >
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{app.url}</span>
                </a>
              )}
              {metrics && (
                <div className="bg-surface-secondary grid gap-3 rounded-lg p-2.5 text-xs">
                  <div>
                    <p className="mb-1.5 tabular-nums">
                      {localize('com_codechat_app_cpu', {
                        used: metrics.cpu_millicores,
                        limit: metrics.cpu_limit_millicores,
                        percent: metrics.cpu_percent,
                      })}
                    </p>
                    <Progress
                      aria-label={localize('com_codechat_cpu_usage')}
                      value={Math.min(100, metrics.cpu_percent)}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 tabular-nums">
                      {localize('com_codechat_app_memory', {
                        used: (metrics.memory_bytes / 1048576).toFixed(1),
                        limit: metrics.memory_limit_bytes / 1048576,
                        percent: metrics.memory_percent,
                      })}
                    </p>
                    <Progress
                      aria-label={localize('com_codechat_memory_usage')}
                      value={Math.min(100, metrics.memory_percent)}
                    />
                  </div>
                </div>
              )}
              {!metrics && app.status === 'running' && (
                <p className="text-text-secondary text-xs">
                  {localize('com_codechat_metrics_waiting')}
                </p>
              )}
              {app.database && (
                <section
                  aria-label={localize('com_codechat_app_database_usage')}
                  className="bg-surface-secondary rounded-lg p-2.5 text-xs"
                >
                  <p className="mb-1.5 tabular-nums">
                    {localize('com_codechat_app_database_metric', {
                      used:
                        app.database.used_bytes == null
                          ? localize('com_codechat_db_unknown')
                          : storageSize(app.database.used_bytes),
                      reserved: storageSize(app.database.reserved_bytes),
                      percent:
                        app.database.used_bytes != null && app.database.reserved_bytes > 0
                          ? ((app.database.used_bytes / app.database.reserved_bytes) * 100).toFixed(
                              1,
                            )
                          : '—',
                    })}
                  </p>
                  {app.database.used_bytes != null && app.database.reserved_bytes > 0 && (
                    <Progress
                      aria-label={localize('com_codechat_app_database_usage')}
                      value={Math.min(
                        100,
                        (app.database.used_bytes / app.database.reserved_bytes) * 100,
                      )}
                    />
                  )}
                  {app.database.observed_at && (
                    <time
                      className="text-text-secondary mt-3 block"
                      dateTime={app.database.observed_at}
                    >
                      {localize('com_codechat_db_observed', {
                        time: new Date(app.database.observed_at).toLocaleString(),
                      })}
                    </time>
                  )}
                </section>
              )}
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  aria-expanded={logsId === app.id}
                  onClick={() => setLogsId(logsId === app.id ? null : app.id)}
                >
                  <ScrollText className="size-3.5" aria-hidden="true" />
                  {localize('com_codechat_app_logs')}
                </Button>
                {app.status !== 'failed' && (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy || operation.isLoading}
                    onClick={() => operation.mutate({ action: 'publish', value: app.project_path })}
                  >
                    <Rocket className="size-3.5" aria-hidden="true" />
                    {localize('com_codechat_app_update')}
                  </Button>
                )}
                <div className="ms-auto">
                  <ApplicationMenu
                    disabled={
                      busy || operation.isLoading || !!app.error_code?.includes('requires_review')
                    }
                    stopped={app.desired_state === 'stopped'}
                    hasImage={!!app.image}
                    onToggle={() =>
                      operation.mutate({
                        action: app.desired_state === 'stopped' ? 'start' : 'stop',
                        value: app.id,
                      })
                    }
                    onDelete={() => setDeleteId(app.id)}
                  />
                </div>
              </div>
              {deleteId === app.id && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs">{localize('com_codechat_app_delete_notice')}</p>
                  <Button
                    variant="destructive"
                    disabled={operation.isLoading}
                    onClick={() => operation.mutate({ action: 'delete', value: app.id })}
                  >
                    {localize('com_codechat_app_delete_confirm')}
                  </Button>
                  <Button variant="ghost" onClick={() => setDeleteId(null)}>
                    {localize('com_ui_cancel')}
                  </Button>
                </div>
              )}
              {logsId === app.id && (
                <pre className="bg-surface-secondary max-h-64 overflow-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
                  {app.observation?.logs || localize('com_codechat_app_no_logs')}
                </pre>
              )}
            </article>
          );
        })}
    </section>
  );
}
