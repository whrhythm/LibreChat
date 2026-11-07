import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectReleases, projectTrials, QueryKeys } from 'librechat-data-provider';
import type { AIPublish } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

export default function Releases({
  projectId,
  embedded = false,
  enabled = true,
}: {
  projectId: string;
  embedded?: boolean;
  enabled?: boolean;
}) {
  const t = useLocalize();
  const { user, token } = useAuthContext();
  const cache = useQueryClient();
  const state = useMemo(
    () =>
      atom({
        expanded: embedded,
        budget: '0.50',
        email: '',
        confirmed: false,
        request: null as AIPublish | null,
      }),
    [embedded],
  );
  const [ui, setUI] = useAtom(state);
  const key = [QueryKeys.aiProjects, user?.id, projectId, 'releases'];
  const list = useQuery({
    queryKey: key,
    queryFn: () => projectReleases(token!, projectId),
    enabled: enabled && !!token && ui.expanded,
    retry: false,
  });
  const trials = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id, projectId, 'trials'],
    queryFn: () => projectTrials(token!, projectId),
    enabled: enabled && !!token && ui.expanded,
    retry: false,
  });
  const change = useMutation({
    mutationFn: ({ suffix, body }: { suffix: string; body: object }) =>
      projectReleases(token!, projectId, suffix, body),
    onSuccess: () => setUI((s) => ({ ...s, request: null, confirmed: false, email: '' })),
    onSettled: () => {
      void cache.invalidateQueries(key);
    },
    retry: false,
  });
  const app = list.data?.application;
  const accepted = trials.data?.trials.find((v) => v.acceptance_valid);
  const input =
    'border-border-light bg-surface-primary text-text-primary w-full rounded border px-2 py-1.5 text-sm';
  const busy = change.isLoading;
  const budget = Math.round(Number(ui.budget) * 1000000);
  return (
    <section className="space-y-3 text-xs" aria-label={t('com_releases_title')}>
      {!embedded && (
        <Button
          size="xs"
          variant="ghost"
          aria-expanded={ui.expanded}
          onClick={() => setUI((s) => ({ ...s, expanded: !s.expanded }))}
        >
          {t('com_releases_title')}
        </Button>
      )}
      {ui.expanded && (
        <>
          <p className="text-text-secondary">{t('com_releases_hint')}</p>
          {(list.isLoading || trials.isLoading) && (
            <p role="status">{t('com_knowledge_loading')}</p>
          )}
          {(list.isError || trials.isError || change.isError) && (
            <p role="alert">{t('com_releases_error')}</p>
          )}
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void list.refetch();
              void trials.refetch();
            }}
          >
            {t('com_releases_refresh')}
          </Button>
          {app && (
            <div className="bg-surface-secondary space-y-2 rounded p-2">
              <p>
                {t('com_releases_current')}{' '}
                {list.data?.releases.find((r) => r.id === app.active_release_id)?.number} ·{' '}
                {t(app.enabled ? 'com_releases_enabled' : 'com_releases_disabled')}
              </p>
              <p>
                {t('com_releases_budget_used')}{' '}
                {`$${(app.held_micros / 1000000).toFixed(6)} / $${(app.budget_micros / 1000000).toFixed(2)}`}
              </p>
              <p className="text-text-secondary">{t('com_releases_meter_hint')}</p>
              <a
                className="text-text-primary block underline"
                href={'/application/' + projectId}
                target="_blank"
                rel="noreferrer"
              >
                {t('com_releases_visit')}
              </a>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    window.location.origin + '/application/' + projectId,
                  )
                }
              >
                {t('com_releases_copy')}
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  change.mutate({
                    suffix: '/access',
                    body: {
                      expected_revision: app.revision,
                      enabled: !app.enabled,
                      budget_micros: app.budget_micros,
                    },
                  })
                }
              >
                {t(app.enabled ? 'com_releases_disable' : 'com_releases_enable')}
              </Button>
            </div>
          )}
          <h4 className="border-border-light border-t pt-3 text-sm font-medium">
            {t('com_project_publication_heading')}
          </h4>
          <label className="block space-y-1">
            <span>{t('com_releases_budget')}</span>
            <input
              className={input}
              aria-label={t('com_releases_budget')}
              type="number"
              min="0.001"
              max="100"
              step="0.01"
              value={ui.budget}
              disabled={busy}
              onChange={(e) => setUI((s) => ({ ...s, budget: e.target.value, request: null }))}
            />
          </label>
          {app && (
            <Button
              size="xs"
              variant="outline"
              disabled={busy || !Number.isFinite(budget) || budget < 1000}
              onClick={() =>
                change.mutate({
                  suffix: '/access',
                  body: {
                    expected_revision: app.revision,
                    enabled: app.enabled,
                    budget_micros: budget,
                  },
                })
              }
            >
              {t('com_releases_save_budget')}
            </Button>
          )}
          <p>
            {accepted
              ? t('com_releases_ready') + ' ' + accepted.number
              : t('com_releases_test_first')}
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={ui.confirmed}
              disabled={busy}
              onChange={(e) => setUI((s) => ({ ...s, confirmed: e.target.checked }))}
            />
            <span>{t('com_releases_confirm')}</span>
          </label>
          <Button
            size="sm"
            disabled={
              busy || !accepted || !ui.confirmed || !Number.isFinite(budget) || budget < 1000
            }
            onClick={() => {
              if (!accepted) return;
              const body = ui.request ?? {
                request_id: crypto.randomUUID(),
                trial_id: accepted.id,
                expected_digest: accepted.digest,
                budget_micros: budget,
                confirm_sponsor: true as const,
              };
              setUI((s) => ({ ...s, request: body }));
              change.mutate({ suffix: '', body });
            }}
          >
            {t(busy ? 'com_releases_working' : 'com_releases_publish')}
          </Button>
          {app && (
            <div className="border-border-light space-y-2 border-t pt-2">
              <h4 className="font-medium">{t('com_releases_members')}</h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  change.mutate({
                    suffix: '/members',
                    body: { identifier: ui.email, enabled: true },
                  });
                }}
              >
                <input
                  className={input}
                  aria-label={t('com_releases_email')}
                  type="text"
                  required
                  value={ui.email}
                  disabled={busy}
                  onChange={(e) => setUI((s) => ({ ...s, email: e.target.value }))}
                />
                <Button size="xs" variant="outline" type="submit" disabled={busy}>
                  {t('com_releases_invite')}
                </Button>
              </form>
              <p className="text-text-secondary">{t('com_releases_invite_hint')}</p>
              {list.data?.members.map((m) => (
                <div
                  key={m.native_id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="break-all">{m.label}</span>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      change.mutate({
                        suffix: '/members',
                        body: { identifier: m.native_id, enabled: !m.enabled },
                      })
                    }
                  >
                    {t(m.enabled ? 'com_releases_revoke' : 'com_releases_restore')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
