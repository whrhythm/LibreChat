import { useState } from 'react';
import { Button } from '@librechat/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { personalApplicationRequest, QueryKeys } from 'librechat-data-provider';
import type { PersonalApplication } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

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
  if (code === 'build_failed') return 'com_codechat_app_build_failed';
  if (code === 'application_start_failed') return 'com_codechat_app_start_failed';
  if (code === 'pushed_image_verify_failed') return 'com_codechat_app_image_failed';
  return 'com_codechat_app_failed_detail';
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
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [logsId, setLogsId] = useState<string | null>(null);
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
    <section
      className="border-border-light flex flex-col gap-2 border-t pt-2"
      aria-label={localize('com_codechat_apps')}
    >
      {canPublish && path && (
        <Button
          variant="outline"
          disabled={operation.isLoading || pending}
          onClick={() => operation.mutate({ action: 'publish', value: path })}
        >
          {localize('com_codechat_app_publish')}
        </Button>
      )}
      <h3 className="text-sm font-medium">{localize('com_codechat_apps')}</h3>
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
              className="border-border-light flex flex-col gap-1 rounded border p-2"
            >
              <p className="truncate text-sm" title={app.project_path}>
                {app.project_path}
              </p>
              <p role="status" className="text-xs">
                {localize(
                  statusKeys[app.status as keyof typeof statusKeys] ?? 'com_codechat_app_preparing',
                )}
              </p>
              {app.error_code && (
                <p role="alert" className="text-xs">
                  {localize(failureKey(app.error_code))}
                </p>
              )}
              {app.status === 'failed' && (
                <>
                  <p className="text-xs">{localize('com_codechat_app_failure_retained')}</p>
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
                <a className="text-sm underline" href={app.url} target="_blank" rel="noreferrer">
                  {localize('com_codechat_app_open')}
                </a>
              )}
              {metrics && (
                <p className="text-xs">
                  {localize('com_codechat_app_cpu', {
                    used: metrics.cpu_millicores,
                    limit: metrics.cpu_limit_millicores,
                    percent: metrics.cpu_percent,
                  })}
                  <br />
                  {localize('com_codechat_app_memory', {
                    used: (metrics.memory_bytes / 1048576).toFixed(1),
                    limit: metrics.memory_limit_bytes / 1048576,
                    percent: metrics.memory_percent,
                  })}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {app.image && (
                  <Button
                    variant="ghost"
                    disabled={busy || operation.isLoading}
                    onClick={() =>
                      operation.mutate({
                        action: app.desired_state === 'stopped' ? 'start' : 'stop',
                        value: app.id,
                      })
                    }
                  >
                    {localize(
                      app.desired_state === 'stopped'
                        ? 'com_codechat_app_start'
                        : 'com_codechat_app_stop',
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={busy || operation.isLoading}
                  onClick={() => setDeleteId(app.id)}
                >
                  {localize('com_codechat_app_remove')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setLogsId(logsId === app.id ? null : app.id)}
                >
                  {localize('com_codechat_app_logs')}
                </Button>
              </div>
              {deleteId === app.id && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs">{localize('com_codechat_app_delete_notice')}</p>
                  <Button
                    variant="outline"
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
                <pre className="max-h-48 overflow-auto text-xs whitespace-pre-wrap">
                  {app.observation?.logs || localize('com_codechat_app_no_logs')}
                </pre>
              )}
            </article>
          );
        })}
    </section>
  );
}
