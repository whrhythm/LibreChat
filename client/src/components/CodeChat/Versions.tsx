import { useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { History, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import { QueryKeys, VersionError, versionRequest } from 'librechat-data-provider';
import type { VersionHistory, VersionDiff, ProjectRestore } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { storageSize } from './storage';

type Action =
  | { kind: 'create'; name: string; key: string }
  | { kind: 'delete'; id: string }
  | { kind: 'restore'; id: string; target: string; key: string };
const errorKeys = {
  versions_agent_active: 'com_codechat_versions_agent_active',
  versions_source_changed: 'com_codechat_versions_source_changed',
  versions_source_too_large: 'com_codechat_versions_source_large',
  versions_count_limit: 'com_codechat_versions_count_limit',
  versions_storage_full: 'com_codechat_versions_storage_full',
  versions_restore_uncertain: 'com_codechat_versions_uncertain',
  versions_restore_blocked: 'com_codechat_versions_blocked',
  versions_restore_pending: 'com_codechat_versions_pending',
} as const;

/** Source history stays in a dialog; chat and the current file remain in place. */
export default function Versions({ path }: { path: string }) {
  const t = useLocalize();
  const { user, token } = useAuthContext();
  const query = useQueryClient();
  const trigger = useRef<HTMLButtonElement>(null);
  const state = useMemo(
    () =>
      atom({
        open: false,
        name: '',
        createKey: '',
        selected: '',
        target: '',
        restoreKey: '',
        diffId: '',
        done: '',
      }),
    [],
  );
  const [value, setValue] = useAtom(state);
  const history = useQuery<VersionHistory>({
    queryKey: [QueryKeys.codechatVersions, user?.id, path],
    queryFn: () => versionRequest(token!, `?path=${encodeURIComponent(path)}`),
    enabled: value.open && !!token && !!path,
    retry: false,
  });
  const diff = useQuery<VersionDiff>({
    queryKey: [QueryKeys.codechatVersionDiff, user?.id, value.diffId],
    queryFn: () => versionRequest(token!, `/${encodeURIComponent(value.diffId)}/diff`),
    enabled: value.open && !!token && !!value.diffId,
    retry: false,
    staleTime: 0,
  });
  const change = useMutation({
    mutationFn: async (action: Action) => {
      if (action.kind === 'create')
        await versionRequest(token!, '', 'POST', { path, name: action.name }, action.key);
      else if (action.kind === 'delete')
        await versionRequest(token!, `/${encodeURIComponent(action.id)}`, 'DELETE');
      else
        await versionRequest(
          token!,
          `/${encodeURIComponent(action.id)}/restore`,
          'POST',
          { target: action.target },
          action.key,
        );
      return action;
    },
    onSuccess: (action) => {
      if (action.kind === 'create')
        setValue((old) => ({
          ...old,
          name: '',
          createKey: crypto.randomUUID(),
          done: t('com_codechat_versions_created'),
        }));
      if (action.kind === 'restore')
        setValue((old) => ({
          ...old,
          selected: '',
          target: '',
          done: t('com_codechat_versions_restored', { path: action.target }),
        }));
      if (action.kind === 'delete')
        setValue((old) => ({ ...old, diffId: '', done: t('com_codechat_versions_deleted') }));
    },
    onSettled: async () => {
      await Promise.all(
        [
          QueryKeys.codechatVersions,
          QueryKeys.codechatFiles,
          QueryKeys.codechatUsage,
          QueryKeys.codechatCapacity,
        ].map((key) => query.invalidateQueries([key, user?.id])),
      );
    },
    retry: false,
  });
  const errorText = (error: unknown) =>
    t(
      error instanceof VersionError && error.code in errorKeys
        ? errorKeys[error.code as keyof typeof errorKeys]
        : 'com_codechat_versions_error',
    );
  const retryRestore = (operation: ProjectRestore) =>
    change.mutate({
      kind: 'restore',
      id: operation.version_id,
      target: operation.target,
      key: operation.request_key,
    });
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="xs"
        disabled={!path}
        title={t('com_codechat_versions_select')}
        onClick={() => {
          change.reset();
          setValue((old) => ({ ...old, open: true, diffId: '', selected: '', done: '' }));
        }}
      >
        <History className="size-3.5" aria-hidden="true" />
        {t('com_codechat_versions_title')}
      </Button>
      <OGDialog
        open={value.open}
        triggerRef={trigger}
        onOpenChange={(open) => {
          if (!change.isLoading) setValue((old) => ({ ...old, open }));
        }}
      >
        <OGDialogContent className="sm:max-w-2xl">
          <OGDialogTitle>{t('com_codechat_versions_title')}</OGDialogTitle>
          <OGDialogDescription>
            {t('com_codechat_versions_description', { path })}
          </OGDialogDescription>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto">
            {history.isLoading && <p role="status">{t('com_ui_loading')}</p>}
            {history.isError && (
              <div role="alert">
                <p>{errorText(history.error)}</p>
                <Button variant="ghost" onClick={() => void history.refetch()}>
                  {t('com_codechat_retry')}
                </Button>
              </div>
            )}
            {history.data && (
              <>
                <p className="text-text-secondary text-xs">
                  {t('com_codechat_versions_limits', {
                    size: storageSize(history.data.max_source_bytes),
                    count: history.data.limit,
                    used: storageSize(history.data.used_bytes),
                  })}
                </p>
                <p className="text-text-secondary text-xs">
                  {t('com_codechat_versions_excluded', { paths: history.data.excluded.join(', ') })}
                </p>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    change.mutate({
                      kind: 'create',
                      name: value.name.trim(),
                      key: value.createKey,
                    });
                  }}
                >
                  <Input
                    aria-label={t('com_codechat_versions_name')}
                    placeholder={t('com_codechat_versions_name')}
                    maxLength={80}
                    value={value.name}
                    disabled={change.isLoading}
                    onChange={(event) =>
                      setValue((old) => ({
                        ...old,
                        name: event.target.value,
                        createKey: crypto.randomUUID(),
                      }))
                    }
                  />
                  <Button type="submit" disabled={change.isLoading || !value.name.trim()}>
                    {t('com_codechat_versions_create')}
                  </Button>
                </form>
                {history.data.restores
                  .filter((item) => item.status !== 'ready')
                  .map((item) => (
                    <div
                      key={item.id}
                      className="border-border-light rounded-lg border p-3 text-sm"
                    >
                      <p>{t('com_codechat_versions_recovery_request', { path: item.target })}</p>
                      <p className="text-text-secondary text-xs">
                        {t(
                          item.status === 'blocked'
                            ? 'com_codechat_versions_blocked'
                            : 'com_codechat_versions_uncertain',
                        )}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={change.isLoading}
                        onClick={() => retryRestore(item)}
                      >
                        {t('com_codechat_versions_verify')}
                      </Button>
                    </div>
                  ))}
                {!history.data.versions.length && (
                  <p className="text-text-secondary text-sm">{t('com_codechat_versions_empty')}</p>
                )}
                <ul className="divide-border-light divide-y">
                  {history.data.versions.map((item) => (
                    <li key={item.id} className="space-y-2 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" title={item.name}>
                            {item.name}
                          </p>
                          <p className="text-text-secondary text-xs">
                            {new Date(item.created_at).toLocaleString()} ·{' '}
                            {storageSize(item.stored_bytes)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={change.isLoading}
                            onClick={() =>
                              setValue((old) => ({
                                ...old,
                                diffId: old.diffId === item.id ? '' : item.id,
                              }))
                            }
                          >
                            {t('com_codechat_versions_diff')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={change.isLoading}
                            onClick={() => {
                              change.reset();
                              setValue((old) => ({
                                ...old,
                                selected: item.id,
                                target: '',
                                restoreKey: crypto.randomUUID(),
                                done: '',
                              }));
                            }}
                          >
                            {t('com_codechat_versions_restore')}
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            disabled={change.isLoading}
                            aria-label={t('com_codechat_versions_delete', { name: item.name })}
                            onClick={() => {
                              if (window.confirm(t('com_codechat_versions_delete_confirm')))
                                change.mutate({ kind: 'delete', id: item.id });
                            }}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                      {value.selected === item.id && (
                        <form
                          className="bg-surface-secondary space-y-2 rounded-lg p-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            change.mutate({
                              kind: 'restore',
                              id: item.id,
                              target: value.target.trim(),
                              key: value.restoreKey,
                            });
                          }}
                        >
                          <p className="text-xs">{t('com_codechat_versions_restore_help')}</p>
                          <Input
                            value={value.target}
                            aria-label={t('com_codechat_versions_target')}
                            placeholder={t('com_codechat_versions_target')}
                            disabled={change.isLoading}
                            maxLength={255}
                            onChange={(event) =>
                              setValue((old) => ({
                                ...old,
                                target: event.target.value,
                                restoreKey: crypto.randomUUID(),
                              }))
                            }
                          />
                          <Button
                            type="submit"
                            size="sm"
                            disabled={
                              change.isLoading || !value.target.trim() || /[/\\]/.test(value.target)
                            }
                          >
                            {t('com_codechat_versions_restore_confirm')}
                          </Button>
                        </form>
                      )}
                      {value.diffId === item.id && (
                        <div className="space-y-2">
                          {diff.isFetching && <p role="status">{t('com_ui_loading')}</p>}
                          {diff.isError && <p role="alert">{errorText(diff.error)}</p>}
                          {diff.data && !diff.isFetching && (
                            <>
                              {!diff.data.changes.length && (
                                <p className="text-text-secondary text-xs">
                                  {t('com_codechat_versions_no_changes')}
                                </p>
                              )}
                              {diff.data.changes.map((file) => (
                                <details
                                  key={file.path}
                                  className="border-border-light rounded border p-2"
                                >
                                  <summary className="cursor-pointer text-xs break-all">
                                    {t(
                                      (
                                        {
                                          added: 'com_codechat_versions_added',
                                          removed: 'com_codechat_versions_removed',
                                          modified: 'com_codechat_versions_modified',
                                        } as const
                                      )[file.change],
                                    )}{' '}
                                    · {file.path}
                                  </summary>
                                  {file.diff !== null ? (
                                    <pre className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre">
                                      {file.diff}
                                    </pre>
                                  ) : (
                                    <p className="text-xs">{t('com_codechat_versions_binary')}</p>
                                  )}
                                  {file.truncated && (
                                    <p className="text-xs">
                                      {t('com_codechat_versions_truncated')}
                                    </p>
                                  )}
                                </details>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {change.isLoading && (
              <p role="status" className="text-sm">
                {t('com_codechat_versions_working')}
              </p>
            )}
            {change.isError && (
              <p role="alert" className="text-sm">
                {errorText(change.error)}
              </p>
            )}
            {!!value.done && (
              <p role="status" className="text-sm">
                {value.done}
              </p>
            )}
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
