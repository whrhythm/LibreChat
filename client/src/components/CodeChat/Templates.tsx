import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import { businessTemplateRequest, TemplateError, QueryKeys } from 'librechat-data-provider';
import type { TemplateState, TemplatePreview, WorkspaceProject } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

const inputStyle =
  'border-border-light bg-surface-primary text-text-primary w-full rounded border px-2 py-1.5 text-sm';
const checkKeys = {
  register: 'com_codechat_template_check_register',
  assign: 'com_codechat_template_check_assign',
  filter: 'com_codechat_template_check_filter',
  preview_boundary: 'com_codechat_template_check_boundary',
} as const;

export function TemplateCreate({
  enabled,
  onCreated,
}: {
  enabled: boolean;
  onCreated: (project: WorkspaceProject) => void;
}) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const client = useQueryClient();
  const state = useMemo(() => atom({ open: false, name: '', requestId: '' }), []);
  const [view, setView] = useAtom(state);
  const catalog = useQuery({
    queryKey: [QueryKeys.workspaceProjects, user?.id, 'templates'],
    queryFn: () => businessTemplateRequest<{ enabled: boolean }>(token!, ''),
    enabled: enabled && !!token,
    retry: false,
  });
  const create = useMutation({
    mutationFn: () =>
      businessTemplateRequest<TemplateState>(token!, '', 'POST', {
        name: view.name,
        request_id: view.requestId,
      }),
    onSuccess: (data) => {
      setView({ open: false, name: '', requestId: '' });
      onCreated(data.project);
      void client.invalidateQueries([QueryKeys.workspaceProjects, user?.id]);
    },
    retry: false,
  });
  if (!catalog.data?.enabled) return null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => {
          create.reset();
          setView({
            open: true,
            name: t('com_codechat_template_default_name'),
            requestId: crypto.randomUUID(),
          });
        }}
      >
        {t('com_codechat_template_start')}
      </Button>
      {view.open && (
        <OGDialog open onOpenChange={(open) => !create.isLoading && setView({ ...view, open })}>
          <OGDialogContent className="max-w-lg">
            <OGDialogTitle>{t('com_codechat_template_start')}</OGDialogTitle>
            <OGDialogDescription>{t('com_codechat_template_create_help')}</OGDialogDescription>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <label className="block space-y-1">
                {t('com_codechat_project_name')}
                <input
                  className={inputStyle}
                  value={view.name}
                  required
                  maxLength={80}
                  onChange={(e) => setView({ ...view, name: e.target.value })}
                />
              </label>
              {create.isError && <p role="alert">{t('com_codechat_template_error')}</p>}
              <Button type="submit" disabled={create.isLoading || !view.name.trim()}>
                {create.isLoading ? t('com_ui_loading') : t('com_codechat_template_create')}
              </Button>
            </form>
          </OGDialogContent>
        </OGDialog>
      )}
    </>
  );
}

export function TemplateProject({
  projectId,
  enabled,
  onApps,
}: {
  projectId: string;
  enabled: boolean;
  onApps: () => void;
}) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const client = useQueryClient();
  const state = useMemo(() => atom({ open: false, checks: [] as string[] }), []);
  const [view, setView] = useAtom(state);
  const key = [QueryKeys.workspaceProject, user?.id, projectId, 'template'];
  const current = useQuery({
    queryKey: key,
    queryFn: async () => {
      try {
        return await businessTemplateRequest<TemplateState>(token!, '/' + projectId);
      } catch (e) {
        if (
          e instanceof TemplateError &&
          ['templates_not_found', 'templates_disabled'].includes(e.code)
        )
          return null;
        throw e;
      }
    },
    enabled: enabled && !!token,
    retry: false,
    refetchInterval: enabled ? 5000 : false,
  });
  const prepare = useMutation({
    mutationFn: () =>
      businessTemplateRequest<TemplateState>(token!, '/' + projectId + '/prepare', 'POST'),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      void client.invalidateQueries([QueryKeys.codechatFiles, user?.id]);
    },
    retry: false,
  });
  const preview = useMutation({
    mutationFn: () =>
      businessTemplateRequest<TemplatePreview>(token!, '/' + projectId + '/preview'),
    onSuccess: () => setView({ open: true, checks: [] }),
    retry: false,
  });
  const access = useMutation({
    mutationFn: () =>
      businessTemplateRequest<{ username: string; password: string }>(
        token!,
        '/' + projectId + '/access',
        'POST',
      ),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () =>
      businessTemplateRequest<TemplateState>(token!, '/' + projectId + '/acceptance', 'PUT', {
        source_sha256: preview.data?.source_sha256,
        checks: view.checks,
        revision: current.data?.acceptance.revision ?? 0,
      }),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      setView({ ...view, open: false });
    },
    retry: false,
  });
  if (current.isError)
    return (
      <p role="alert" className="text-xs">
        {t('com_codechat_template_error')}
        <Button size="xs" variant="ghost" onClick={() => void current.refetch()}>
          {t('com_codechat_retry')}
        </Button>
      </p>
    );
  const data = current.data;
  if (!data) return null;
  const prepared = data.state === 'files_ready';
  const ready = data.database?.status === 'ready';
  function statusLabel() {
    if (!prepared) return 'com_codechat_template_unprepared';
    if (ready) return 'com_codechat_template_ready';
    if (data?.database?.status === 'failed') return 'com_codechat_template_database_failed';
    return 'com_codechat_template_database_wait';
  }
  const error = prepare.error ?? preview.error ?? access.error;
  const matched =
    data.release_acceptance?.source_sha256 &&
    data.release_acceptance.source_sha256 === data.release_source_sha256;
  return (
    <section
      className="border-border-light space-y-3 rounded-lg border p-3 text-xs"
      aria-label={t('com_codechat_template_title')}
    >
      <h3 className="font-medium">{t('com_codechat_template_title')}</h3>
      <p className="text-text-secondary">{t('com_codechat_template_steps')}</p>
      <p role="status">{t(statusLabel())}</p>
      {(!prepared || !data.database) && (
        <Button size="sm" disabled={prepare.isLoading} onClick={() => prepare.mutate()}>
          {t('com_codechat_template_prepare')}
        </Button>
      )}
      {prepared && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={preview.isLoading}
            onClick={() => {
              accept.reset();
              preview.mutate();
            }}
          >
            {t('com_codechat_template_preview')}
          </Button>
          <Button size="sm" disabled={!ready} onClick={onApps}>
            {t('com_codechat_template_publish')}
          </Button>
        </div>
      )}
      {!!data.acceptance.source_sha256 && <p>{t('com_codechat_template_accepted')}</p>}
      {data.release_source_sha256 && (
        <p>
          {t(
            matched
              ? 'com_codechat_template_release_matched'
              : 'com_codechat_template_release_unmatched',
          )}
        </p>
      )}
      {error && (
        <p role="alert">
          {t(
            error instanceof TemplateError && error.code === 'templates_database_allowance'
              ? 'com_codechat_template_database_quota'
              : 'com_codechat_template_error',
          )}
        </p>
      )}
      {ready && (
        <details>
          <summary className="cursor-pointer">{t('com_codechat_template_owner')}</summary>
          <p className="text-text-secondary my-2">{t('com_codechat_template_owner_help')}</p>
          <Button
            size="xs"
            variant="outline"
            disabled={access.isLoading}
            onClick={() => (access.data ? access.reset() : access.mutate())}
          >
            {t(
              access.data
                ? 'com_codechat_template_hide_access'
                : 'com_codechat_template_show_access',
            )}
          </Button>
          {access.data && (
            <div className="mt-2 space-y-2">
              <label className="block">
                {t('com_codechat_template_username')}
                <input className={inputStyle} readOnly value={access.data.username} />
              </label>
              <label className="block">
                {t('com_codechat_template_password')}
                <input
                  className={inputStyle}
                  readOnly
                  value={access.data.password}
                  autoComplete="off"
                />
              </label>
            </div>
          )}
        </details>
      )}
      {view.open && preview.data && (
        <OGDialog open onOpenChange={(open) => setView({ ...view, open })}>
          <OGDialogContent className="max-w-6xl">
            <OGDialogTitle>{t('com_codechat_template_preview')}</OGDialogTitle>
            <OGDialogDescription>{t('com_codechat_template_preview_help')}</OGDialogDescription>
            <div className="max-h-[78vh] space-y-3 overflow-auto">
              <iframe
                title={t('com_codechat_template_frame')}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                srcDoc={preview.data.html}
                className="border-border-light h-[50vh] w-full rounded-lg border"
              />
              <fieldset className="grid gap-2 text-sm sm:grid-cols-2">
                <legend className="mb-2 font-medium">{t('com_codechat_template_checks')}</legend>
                {Object.entries(checkKeys).map(([id, label]) => (
                  <label key={id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={view.checks.includes(id)}
                      onChange={(e) =>
                        setView({
                          ...view,
                          checks: e.target.checked
                            ? [...view.checks, id]
                            : view.checks.filter((x) => x !== id),
                        })
                      }
                    />
                    {t(label)}
                  </label>
                ))}
              </fieldset>
              {accept.isError && <p role="alert">{t('com_codechat_template_accept_error')}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    accept.reset();
                    preview.mutate();
                  }}
                  disabled={preview.isLoading}
                >
                  {t('com_codechat_template_reload_preview')}
                </Button>
                <Button
                  disabled={view.checks.length !== 4 || accept.isLoading}
                  onClick={() => accept.mutate()}
                >
                  {t('com_codechat_template_accept')}
                </Button>
              </div>
            </div>
          </OGDialogContent>
        </OGDialog>
      )}
    </section>
  );
}
