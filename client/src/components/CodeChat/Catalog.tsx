import { useMemo, useRef } from 'react';
import { Bot, RefreshCw } from 'lucide-react';
import { atom, useAtom, useAtomValue } from 'jotai';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, OGDialog, OGDialogContent, OGDialogTitle } from '@librechat/client';
import { assistantCatalog, projectReleases, QueryKeys } from 'librechat-data-provider';
import { activePanelAtom } from '~/Providers/ActivePanelContext';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import Releases from './Releases';

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
  const state = useMemo(() => atom({ filter: 'all', manage: '' }), []);
  const [ui, setUI] = useAtom(state);
  const trigger = useRef<HTMLButtonElement>(null);
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
    list.data?.items.filter((item) => ui.filter === 'all' || item.kind === ui.filter) ?? [];
  const coding = startup?.codechat?.capabilities;
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
      <div className="flex gap-1" aria-label={t('com_catalog_filter')}>
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
      {(list.isError || reply.isError) && <p role="alert">{t('com_catalog_error')}</p>}
      {list.isLoading && <p role="status">{t('com_ui_loading')}</p>}
      {!!list.data?.invitations.length && (
        <div className="border-border-light space-y-2 rounded-lg border p-2">
          <h3 className="font-medium">
            {t('com_catalog_invitations')} · {list.data.invitations.length}
          </h3>
          {list.data.invitations.map((item) => (
            <article key={item.project_id} className="border-border-light space-y-2 border-t pt-2">
              <p className="font-medium break-words">{item.name}</p>
              <p className="text-text-secondary text-xs">
                {t('com_releases_creator_pays')} · {t('com_sharing_limit')} $
                {(item.budget_micros / 1e6).toFixed(2)}
              </p>
              <p className="text-text-secondary text-xs">{t('com_sharing_readonly')}</p>
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
      {ui.filter === 'all' && coding?.enabled && (
        <article className="border-border-light space-y-2 rounded-lg border p-3">
          <h3 className="flex items-center gap-2 font-medium">
            <Bot className="size-4" />
            {t('com_catalog_coding')}
          </h3>
          <p className="text-text-secondary text-xs">{t('com_catalog_system')}</p>
          <a
            className="border-border-light hover:bg-surface-hover inline-flex rounded border px-3 py-1.5 text-xs"
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
      {items.map((item) => (
        <article
          key={item.project_id}
          className="border-border-light space-y-2 rounded-lg border p-3"
        >
          <h3 className="font-medium break-words">{item.name}</h3>
          <p className="text-text-secondary text-xs">
            {t('com_releases_current')} {item.number} ·{' '}
            {t(item.kind === 'mine' ? 'com_catalog_mine' : 'com_catalog_shared')}
          </p>
          <p className="text-xs">
            {t('com_sharing_occupied')}{' '}
            {`$${(item.held_micros / 1e6).toFixed(4)} / $${(item.budget_micros / 1e6).toFixed(2)}`}
          </p>
          <p className="text-text-secondary text-xs">{t('com_releases_creator_pays')}</p>
          {item.expires_at && (
            <p className="text-xs">
              {t('com_sharing_expiry')} {new Date(item.expires_at).toLocaleString()}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              className="border-border-light hover:bg-surface-hover inline-flex rounded border px-3 py-1.5 text-xs"
              target="_blank"
              rel="noreferrer"
              href={'/application/' + encodeURIComponent(item.project_id)}
            >
              {t('com_catalog_open')}
            </a>
            {item.kind === 'mine' && (
              <Button
                size="xs"
                variant="ghost"
                ref={trigger}
                onClick={() => setUI((s) => ({ ...s, manage: item.project_id }))}
              >
                {t('com_sharing_manage')}
              </Button>
            )}
          </div>
        </article>
      ))}
      {list.isSuccess && !items.length && (
        <p className="text-text-secondary py-4 text-xs">{t('com_catalog_empty')}</p>
      )}
      <OGDialog
        open={!!ui.manage}
        onOpenChange={(open) => {
          if (!open) setUI((s) => ({ ...s, manage: '' }));
        }}
      >
        <OGDialogContent
          className="max-h-[85dvh] max-w-2xl overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <OGDialogTitle>{t('com_sharing_manage')}</OGDialogTitle>
          {ui.manage && <Releases key={ui.manage} projectId={ui.manage} embedded />}
        </OGDialogContent>
      </OGDialog>
    </section>
  );
}
