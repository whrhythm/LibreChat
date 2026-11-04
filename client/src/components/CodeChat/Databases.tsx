import { useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import {
  personalFileRequest,
  projectDatabaseRequest,
  ProjectDatabaseError,
  QueryKeys,
} from 'librechat-data-provider';
import type { ProjectDatabase, WorkspaceEntry } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { storageSize } from './storage';

const statusKeys = {
  requested: 'com_codechat_db_requested',
  provisioning: 'com_codechat_db_provisioning',
  ready: 'com_codechat_db_ready',
  failed: 'com_codechat_db_failed',
  deleting: 'com_codechat_db_deleting',
  deleted: 'com_codechat_db_deleted',
} as const;
const errorKeys = {
  database_allowance_exceeded: 'com_codechat_db_limit',
  remove_application_before_database: 'com_codechat_db_remove_app',
  wait_for_database_operation: 'com_codechat_db_wait',
  database_ownership_requires_review: 'com_codechat_db_review',
  database_confirmation_mismatch: 'com_codechat_db_confirmation_error',
  database_measurement_unavailable: 'com_codechat_db_measurement_error',
} as const;

export default function Databases({
  path,
  onPathChange,
  enabled,
  scoped = false,
}: {
  path: string;
  onPathChange: (path: string) => void;
  enabled: boolean;
  scoped?: boolean;
}) {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const client = useQueryClient();
  const [confirmation, setConfirmation] = useAtom(
    useMemo(() => atom<{ row: ProjectDatabase; text: string } | null>(null), []),
  );
  const trigger = useRef<HTMLButtonElement | null>(null);
  const active = enabled && !!user?.id && !!token;
  const listing = useQuery({
    queryKey: [QueryKeys.codechatDatabases, user?.id],
    queryFn: () => projectDatabaseRequest(token!, 'list'),
    enabled: active,
    retry: false,
    refetchInterval: active ? 5000 : false,
  });
  const root = useQuery<{ entries: WorkspaceEntry[] }>({
    queryKey: [QueryKeys.codechatFiles, user?.id, ''],
    queryFn: async () => (await personalFileRequest(token!, 'directories', 'GET', '')).json(),
    enabled: active && !scoped,
    retry: false,
    refetchInterval: active ? 5000 : false,
  });
  const mutation = useMutation({
    mutationFn: (operation: {
      action: 'create' | 'retry' | 'delete';
      id?: string;
      path?: string;
      confirmation?: string;
    }) => projectDatabaseRequest(token!, operation.action, operation),
    onSuccess: () => {
      setConfirmation(null);
      void client.invalidateQueries([QueryKeys.codechatDatabases, user?.id]);
      void client.invalidateQueries([QueryKeys.codechatCapacity, user?.id]);
    },
  });
  const errorKey = (code: string | null | undefined) =>
    errorKeys[code as keyof typeof errorKeys] ?? 'com_codechat_db_error';
  const projects =
    root.data?.entries.filter((entry) => entry.kind === 'directory').map((entry) => entry.name) ??
    [];
  if (path && !projects.includes(path)) projects.unshift(path);
  const data = listing.data;
  const existing = data?.databases.find(
    (row) => row.project_path === path && row.status !== 'deleted',
  );
  return (
    <div className="flex flex-col gap-3">
      <p>{localize('com_codechat_db_description')}</p>
      {(listing.isError || root.isError) && (
        <div role="alert">
          <p>{localize('com_codechat_db_error')}</p>
          <Button
            variant="outline"
            onClick={() => {
              void listing.refetch();
              void root.refetch();
            }}
          >
            {localize('com_codechat_retry')}
          </Button>
        </div>
      )}
      {listing.isLoading && <p role="status">{localize('com_ui_loading')}</p>}
      {data && (
        <>
          <p>
            {localize('com_codechat_db_allowance', {
              reserved: storageSize(data.reserved_bytes),
              budget: storageSize(data.budget_bytes),
            })}
          </p>
          <p>{localize('com_codechat_db_quota_note')}</p>
          {!data.enabled && <p>{localize('com_codechat_db_disabled')}</p>}
          {!scoped && (
            <>
              <label htmlFor="codechat-db-project">{localize('com_codechat_db_project')}</label>
              <select
                id="codechat-db-project"
                value={path}
                onChange={(event) => onPathChange(event.target.value)}
                className="border-border-light bg-surface-primary text-text-primary w-full min-w-0 rounded border p-2"
              >
                <option value="">{localize('com_codechat_choose_project')}</option>
                {projects.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </>
          )}
          <Button
            variant="outline"
            disabled={!path || !data.enabled || !!existing || mutation.isLoading || root.isError}
            onClick={() => mutation.mutate({ action: 'create', path })}
          >
            {localize('com_codechat_db_create')}
          </Button>
          {data.databases
            .filter((row) => row.status !== 'deleted' && (!scoped || row.project_path === path))
            .map((row) => (
              <article
                key={row.id}
                aria-label={row.project_path}
                className="border-border-light flex flex-col gap-2 rounded border p-2"
              >
                <h3 className="break-all">{row.project_path}</h3>
                <p role="status">{localize(statusKeys[row.status])}</p>
                <p>
                  {localize('com_codechat_db_usage', {
                    used:
                      row.used_bytes === null
                        ? localize('com_codechat_db_unknown')
                        : storageSize(row.used_bytes),
                    reserved: storageSize(row.reserved_bytes),
                  })}
                </p>
                {row.observed_at && (
                  <p>
                    {localize('com_codechat_db_observed', {
                      time: new Date(row.observed_at).toLocaleString(),
                    })}
                  </p>
                )}
                {row.used_bytes !== null && row.used_bytes > row.reserved_bytes && (
                  <p role="alert">{localize('com_codechat_db_over_budget')}</p>
                )}
                {row.status === 'ready' && <p>{localize('com_codechat_db_ready_help')}</p>}
                {row.error_code && <p role="alert">{localize(errorKey(row.error_code))}</p>}
                {row.status === 'failed' &&
                  row.error_code !== 'database_ownership_requires_review' && (
                    <Button
                      variant="outline"
                      disabled={mutation.isLoading}
                      onClick={() => mutation.mutate({ action: 'retry', id: row.id })}
                    >
                      {localize('com_codechat_retry')}
                    </Button>
                  )}
                {(row.status === 'ready' || row.status === 'failed') && (
                  <Button
                    variant="outline"
                    disabled={mutation.isLoading}
                    onClick={(event) => {
                      trigger.current = event.currentTarget;
                      mutation.reset();
                      setConfirmation({ row, text: '' });
                    }}
                  >
                    {localize('com_codechat_db_delete')}
                  </Button>
                )}
              </article>
            ))}
        </>
      )}
      {mutation.isError && !confirmation && (
        <p role="alert">
          {localize(
            errorKey(mutation.error instanceof ProjectDatabaseError ? mutation.error.code : null),
          )}
        </p>
      )}
      {confirmation && (
        <OGDialog
          open
          onOpenChange={(open) => !open && !mutation.isLoading && setConfirmation(null)}
          triggerRef={trigger}
        >
          <OGDialogContent>
            <OGDialogTitle>{localize('com_codechat_db_delete')}</OGDialogTitle>
            <OGDialogDescription>
              {localize('com_codechat_db_delete_warning', { path: confirmation.row.project_path })}
            </OGDialogDescription>
            <label htmlFor="codechat-db-confirm">{localize('com_codechat_db_confirmation')}</label>
            <Input
              id="codechat-db-confirm"
              value={confirmation.text}
              onChange={(event) => setConfirmation({ ...confirmation, text: event.target.value })}
            />
            <Button
              variant="outline"
              disabled={mutation.isLoading}
              onClick={() => setConfirmation(null)}
            >
              {localize('com_ui_cancel')}
            </Button>
            <Button
              disabled={mutation.isLoading || confirmation.text !== confirmation.row.project_path}
              onClick={() =>
                mutation.mutate({
                  action: 'delete',
                  id: confirmation.row.id,
                  confirmation: confirmation.text,
                })
              }
            >
              {localize('com_codechat_db_confirm_delete')}
            </Button>
            {mutation.isError && (
              <p role="alert">
                {localize(
                  errorKey(
                    mutation.error instanceof ProjectDatabaseError ? mutation.error.code : null,
                  ),
                )}
              </p>
            )}
          </OGDialogContent>
        </OGDialog>
      )}
    </div>
  );
}
