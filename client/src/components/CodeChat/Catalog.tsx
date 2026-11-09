import { useMemo, useRef } from 'react';
import { atom, useAtom, useAtomValue } from 'jotai';
import { Bot, MoreHorizontal, RefreshCw, UsersRound } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, OGDialog, OGDialogContent, OGDialogTitle } from '@librechat/client';
import { assistantCatalog, projectReleases, QueryKeys } from 'librechat-data-provider';
import { activePanelAtom } from '~/Providers/ActivePanelContext';
import Releases, { type ReleaseTab } from './Releases';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

const filters = {
  all: 'com_catalog_all',
  mine: 'com_catalog_mine',
  shared: 'com_catalog_shared',
} as const;

export default function Catalog() {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const active = useAtomValue(activePanelAtom) === 'assistant-catalog';
  const cache = useQueryClient();
  const { data: startup } = useGetStartupConfig();
  const state = useMemo(
    () =>
      atom({
        filter: 'all',
        sharedOnly: false,
        manage: null as null | { id: string; name: string; tab: ReleaseTab },
      }),
    [],
  );
  const [ui, setUI] = useAtom(state);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const key = [QueryKeys.assistantCatalog, user?.id];
  const list = useQuery({
    queryKey: key,
    queryFn: () => assistantCatalog(token!),
    enabled: active && !!token,
    retry: false,
    refetchInterval: active ? (startup?.assistantCatalogRefreshMs ?? false) : false,
  });
  const reply = useMutation({
    mutationKey: [QueryKeys.assistantCatalog, 'reply', user?.id],
    mutationFn: (input: { project: string; revision: number; accept: boolean }) =>
      projectReleases(token!, input.project, '/invitation', {
        expected_revision: input.revision,
        accept: input.accept,
      }),
    onSettled: () => {
      void cache.invalidateQueries(key);
    },
    retry: false,
  });
  const items =
    list.data?.items.filter((item) => {
      if (ui.filter !== 'all' && item.kind !== ui.filter) return false;
      const count = item.member_summary;
      return ui.filter !== 'mine' || !ui.sharedOnly || !!(count && count.active + count.pending);
    }) ?? [];
  const coding = startup?.codechat?.capabilities;
  const openCoding = ui.filter === 'all' && coding?.enabled;
  const invitations = ui.filter !== 'mine' ? (list.data?.invitations ?? []) : [];
  const openManagement = (button: HTMLButtonElement, id: string, name: string, tab: ReleaseTab) => {
    trigger.current = button;
    setUI((s) => ({ ...s, manage: { id, name, tab } }));
  };
  const openClass =
    'border-border-light hover:bg-surface-hover inline-flex h-7 items-center rounded-md border px-2 text-xs';
  return (
    <section
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 text-sm"
      aria-label={t('com_catalog_title')}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t('com_catalog_title')}</h2>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('com_releases_refresh')}
          onClick={() => void list.refetch()}
        >
          <RefreshCw className="size-4" />
        </Button>
      </header>
      <div
        className="border-border-light flex flex-wrap gap-1 border-b pb-2"
        aria-label={t('com_catalog_filter')}
      >
        {(['all', 'mine', 'shared'] as const).map((filter) => (
          <Button
            size="xs"
            variant={ui.filter === filter ? 'secondary' : 'ghost'}
            key={filter}
            aria-pressed={ui.filter === filter}
            onClick={() => setUI((s) => ({ ...s, filter }))}
          >
            {t(filters[filter])}
          </Button>
        ))}
      </div>
      {ui.filter === 'mine' && (
        <label className="text-text-secondary flex w-fit items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={ui.sharedOnly}
            onChange={(e) => setUI((s) => ({ ...s, sharedOnly: e.target.checked }))}
          />
          {t('com_catalog_shared_only')}
        </label>
      )}
      {(list.isError || reply.isError) && <p role="alert">{t('com_catalog_error')}</p>}
      {list.isLoading && <p role="status">{t('com_ui_loading')}</p>}
      {!!invitations.length && (
        <div className="border-border-light space-y-2 rounded-lg border p-2">
          <h3 className="font-medium">
            {t('com_catalog_invitations')} · {invitations.length}
          </h3>
          {invitations.map((item) => (
            <article key={item.project_id} className="border-border-light space-y-2 border-t pt-2">
              <p className="font-medium break-words">{item.name}</p>
              <p className="text-text-secondary text-xs">
                {`${t('com_releases_creator_pays')} · $${(item.budget_micros / 1e6).toFixed(2)}`}
              </p>
              {item.expires_at && (
                <p className="text-xs">
                  {t('com_sharing_expiry')} {new Date(item.expires_at).toLocaleString()}
                </p>
              )}
              <div className="flex gap-2">
                {[true, false].map((accept) => (
                  <Button
                    key={String(accept)}
                    size="xs"
                    variant={accept ? 'default' : 'ghost'}
                    disabled={reply.isLoading}
                    onClick={() =>
                      reply.mutate({ project: item.project_id, revision: item.revision, accept })
                    }
                  >
                    {t(accept ? 'com_catalog_accept' : 'com_catalog_decline')}
                  </Button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="divide-border-light divide-y">
        {openCoding && (
          <article className="flex min-w-0 items-center gap-2 py-2.5">
            <Bot className="text-text-secondary size-4 shrink-0" aria-hidden="true" />
            <h3 className="min-w-0 flex-1 truncate font-medium" title={t('com_catalog_coding')}>
              {t('com_catalog_coding')}
            </h3>
            <a
              className={openClass}
              target="_blank"
              rel="noreferrer"
              href={
                '/c/new?endpoint=' +
                encodeURIComponent(coding.endpoint) +
                '&model=' +
                encodeURIComponent(coding.codingRoute)
              }
            >
              {t('com_catalog_open')}
            </a>
          </article>
        )}
        {items.map((item) => {
          const count = item.member_summary;
          const shareLabel =
            count && count.active + count.pending > 0
              ? [
                  count.active ? t('com_catalog_active_count', { 0: count.active }) : '',
                  count.pending ? t('com_catalog_pending_count', { 0: count.pending }) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : t(count ? 'com_catalog_private' : 'com_sharing_members_tab');
          return (
            <article key={item.project_id} className="flex min-w-0 items-start gap-2 py-2.5">
              <Bot className="text-text-secondary mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-medium" title={item.name}>
                  {item.name}
                </h3>
                <div className="text-text-secondary mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                  <span>{`v${item.number}`}</span>
                  {item.kind === 'mine' ? (
                    <button
                      type="button"
                      className="hover:text-text-primary inline-flex items-center gap-1 rounded px-0.5 hover:underline"
                      onClick={(e) =>
                        openManagement(e.currentTarget, item.project_id, item.name, 'members')
                      }
                    >
                      <UsersRound className="size-3 shrink-0" aria-hidden="true" />
                      {shareLabel}
                    </button>
                  ) : (
                    <span>{t('com_catalog_shared')}</span>
                  )}
                  {item.expires_at && <span>{new Date(item.expires_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  className={openClass}
                  target="_blank"
                  rel="noreferrer"
                  href={'/application/' + encodeURIComponent(item.project_id)}
                >
                  {t('com_catalog_open')}
                </a>
                {item.kind === 'mine' && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={t('com_sharing_manage')}
                    title={t('com_sharing_manage')}
                    onClick={(e) =>
                      openManagement(e.currentTarget, item.project_id, item.name, 'version')
                    }
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {list.isSuccess && !items.length && !openCoding && !invitations.length && (
        <p className="text-text-secondary py-4 text-xs">{t('com_catalog_empty')}</p>
      )}
      <OGDialog
        open={!!ui.manage}
        onOpenChange={(open) => {
          if (!open) setUI((s) => ({ ...s, manage: null }));
        }}
      >
        <OGDialogContent
          className="max-h-[85dvh] max-w-xl overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <OGDialogTitle className="mr-6 truncate text-base">
            {ui.manage?.name ?? t('com_sharing_manage')}
          </OGDialogTitle>
          {ui.manage && (
            <Releases
              key={ui.manage.id}
              projectId={ui.manage.id}
              initialTab={ui.manage.tab}
              embedded
            />
          )}
        </OGDialogContent>
      </OGDialog>
    </section>
  );
}
