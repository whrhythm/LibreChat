import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { RefreshCw } from 'lucide-react';
import { Button } from '@librechat/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectReleases, projectTrials, QueryKeys } from 'librechat-data-provider';
import type { AIPublish, AIReleaseToolReview } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import Sharing from './Sharing';

const tabs = {
  members: 'com_sharing_members_tab',
  version: 'com_ui_versions',
  budget: 'com_sharing_budget_tab',
} as const;
export type ReleaseTab = keyof typeof tabs;

function sharingError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'ai_releases_member_unavailable') return 'com_sharing_unavailable';
  if (code === 'ai_releases_changed') return 'com_sharing_conflict';
  if (code === 'ai_releases_expiry_invalid') return 'com_sharing_expiry_invalid';
  if (code === 'ai_releases_tool_trial_only') return 'com_project_tool_trial_only';
  if (code === 'ai_releases_tool_review_required') return 'com_releases_tool_review_required';
  if (code === 'ai_releases_tool_consent_required') return 'com_releases_tool_consent';
  return 'com_releases_error';
}
export default function Releases({
  projectId,
  embedded = false,
  enabled = true,
  initialTab = 'version',
}: {
  projectId: string;
  embedded?: boolean;
  enabled?: boolean;
  initialTab?: ReleaseTab;
}) {
  const t = useLocalize();
  const { user, token } = useAuthContext();
  const cache = useQueryClient();
  const state = useMemo(
    () =>
      atom({
        expanded: embedded,
        tab: initialTab,
        budget: null as string | null,
        confirmed: false,
        toolConsent: null as string | null,
        request: null as AIPublish | null,
      }),
    [embedded, initialTab],
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
  const reference = trials.data?.config?.tool_reference;
  const personal =
    reference?.startsWith('action:') || reference?.startsWith('projecttool:') ? reference : null;
  const reviewKey = [...key, 'tool-review', personal];
  const review = useQuery({
    queryKey: reviewKey,
    queryFn: () => projectReleases<AIReleaseToolReview>(token!, projectId, '/tool-review'),
    enabled: enabled && !!token && ui.expanded && !!personal,
    retry: false,
  });
  const submitReview = useMutation({
    mutationFn: () => projectReleases<AIReleaseToolReview>(token!, projectId, '/tool-review', {}),
    onSuccess: (value) => cache.setQueryData(reviewKey, value),
  });
  const change = useMutation({
    mutationFn: ({ suffix, body }: { suffix: string; body: object }) =>
      projectReleases(token!, projectId, suffix, body),
    onSuccess: () => setUI((s) => ({ ...s, request: null, confirmed: false, toolConsent: null })),
    onSettled: () => {
      void cache.invalidateQueries(key);
      void cache.invalidateQueries([QueryKeys.assistantCatalog, user?.id]);
    },
    retry: false,
  });
  const app = list.data?.application;
  const accepted = trials.data?.trials.find((v) => v.acceptance_valid);
  const toolReview = review.data?.review;
  const toolTitle = trials.data?.available_tools?.find(
    (tool) => tool.reference === personal,
  )?.service;
  const toolApproved =
    !!personal && toolReview?.reference === personal && toolReview.state === 'approved';
  const input =
    'border-border-light bg-surface-primary text-text-primary w-full rounded border px-2 py-1.5 text-sm';
  const busy = change.isLoading;
  const budgetValue = ui.budget ?? String((app?.budget_micros ?? 500000) / 1000000);
  const budget = Math.round(Number(budgetValue) * 1000000);
  const validBudget = Number.isFinite(budget) && budget >= 1000 && budget <= 100000000;
  const current = list.data?.releases.find((r) => r.id === app?.active_release_id);
  const ready = accepted?.id === current?.trial_id ? undefined : accepted;
  const budgetField = (
    <label className="block space-y-1">
      <span>{t('com_sharing_budget_limit')}</span>
      <input
        className={input}
        type="number"
        min="0.001"
        max="100"
        step="0.001"
        value={budgetValue}
        disabled={busy}
        onChange={(e) => setUI((s) => ({ ...s, budget: e.target.value, request: null }))}
      />
    </label>
  );
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
          <div className="border-border-light flex items-center justify-between gap-2 border-b pb-2">
            <div className="flex gap-1" role="group" aria-label={t('com_sharing_manage')}>
              {(Object.keys(tabs) as ReleaseTab[]).map((tab) => (
                <Button
                  key={tab}
                  type="button"
                  size="xs"
                  variant={ui.tab === tab ? 'secondary' : 'ghost'}
                  aria-pressed={ui.tab === tab}
                  onClick={() => setUI((s) => ({ ...s, tab }))}
                >
                  {t(tabs[tab])}
                </Button>
              ))}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              aria-label={t('com_releases_refresh')}
              title={t('com_releases_refresh')}
              disabled={busy}
              onClick={() => {
                void list.refetch();
                void trials.refetch();
                if (personal) void review.refetch();
              }}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
          {(list.isLoading || trials.isLoading) && (
            <p role="status">{t('com_knowledge_loading')}</p>
          )}
          {(list.isError || trials.isError || change.isError) && (
            <p role="alert">{t(sharingError(change.error))}</p>
          )}
          {ui.tab === 'version' && list.isSuccess && trials.isSuccess && (
            <>
              {app && (
                <div className="border-border-light space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">
                    {current ? `v${current.number} · ` : ''}
                    {t(app.enabled ? 'com_releases_enabled' : 'com_releases_disabled')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      className="text-text-primary px-1 underline"
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
                </div>
              )}
              {(!app || ready) && (
                <div className="space-y-3">
                  <p>
                    {ready
                      ? t('com_releases_ready') + ' ' + ready.number
                      : t('com_releases_test_first')}
                  </p>
                  {!app && budgetField}
                  {personal && (
                    <div className="border-border-light space-y-2 rounded border p-2">
                      <p className="font-medium">
                        {toolTitle ?? toolReview?.title ?? t('com_releases_tool_review')}
                      </p>
                      {review.isLoading && <p role="status">{t('com_knowledge_loading')}</p>}
                      {(review.isError || submitReview.isError) && (
                        <p role="alert">{t(sharingError(submitReview.error ?? review.error))}</p>
                      )}
                      {toolReview && <p>{t(`com_releases_tool_${toolReview.state}` as const)}</p>}
                      {review.isSuccess && !toolReview && (
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={busy || submitReview.isLoading || !toolTitle}
                          onClick={() => submitReview.mutate()}
                        >
                          {t('com_releases_submit_tool')}
                        </Button>
                      )}
                      {toolApproved && (
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={ui.toolConsent === personal}
                            onChange={(e) =>
                              setUI((s) => ({
                                ...s,
                                toolConsent: e.target.checked ? personal : null,
                                request: null,
                              }))
                            }
                          />
                          <span>{t('com_releases_tool_consent')}</span>
                        </label>
                      )}
                    </div>
                  )}
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
                      busy ||
                      !ready ||
                      !ui.confirmed ||
                      !validBudget ||
                      (!!personal && (!toolApproved || ui.toolConsent !== personal))
                    }
                    onClick={() => {
                      if (!accepted) return;
                      const body = ui.request ?? {
                        request_id: crypto.randomUUID(),
                        trial_id: accepted.id,
                        expected_digest: accepted.digest,
                        budget_micros: budget,
                        confirm_sponsor: true as const,
                        ...(personal ? { confirm_tool_reference: personal } : {}),
                      };
                      setUI((s) => ({ ...s, request: body }));
                      change.mutate({ suffix: '', body });
                    }}
                  >
                    {t(busy ? 'com_releases_working' : 'com_releases_publish')}
                  </Button>
                </div>
              )}
            </>
          )}
          {ui.tab === 'members' && app && (
            <Sharing
              members={list.data?.members ?? []}
              defaultBudgetMicros={Math.min(100000, app.budget_micros)}
              busy={busy}
              change={(input) => change.mutate(input)}
            />
          )}
          {ui.tab === 'members' && list.isSuccess && !app && (
            <p className="text-text-secondary">{t('com_sharing_publish_first')}</p>
          )}
          {ui.tab === 'budget' && list.isSuccess && (
            <div className="space-y-3">
              {app && (
                <div className="border-border-light flex items-center justify-between gap-2 rounded-md border p-3">
                  <span>{t('com_releases_budget_used')}</span>
                  <span className="font-medium tabular-nums">
                    {`$${(app.held_micros / 1e6).toFixed(6)} / $${(app.budget_micros / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`}
                  </span>
                </div>
              )}
              {budgetField}
              {app && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy || !validBudget || budget === app.budget_micros}
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
              <details className="text-text-secondary">
                <summary className="cursor-pointer">{t('com_sharing_budget_help')}</summary>
                <p className="mt-2">{t('com_releases_meter_hint')}</p>
                <p className="mt-1">{t('com_sharing_budget_hint')}</p>
              </details>
            </div>
          )}
        </>
      )}
    </section>
  );
}
