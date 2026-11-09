import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectReleases, projectTrials, QueryKeys } from 'librechat-data-provider';
import type { AIPublish, AIReleaseToolReview } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import Sharing from './Sharing';

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
        budget: null as string | null,
        confirmed: false,
        toolConsent: null as string | null,
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
            <p role="alert">{t(sharingError(change.error))}</p>
          )}
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void list.refetch();
              void trials.refetch();
              if (personal) void review.refetch();
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
              value={budgetValue}
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
              !accepted ||
              !ui.confirmed ||
              !Number.isFinite(budget) ||
              budget < 1000 ||
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
          {app && (
            <Sharing
              members={list.data?.members ?? []}
              busy={busy}
              change={(input) => change.mutate(input)}
            />
          )}
        </>
      )}
    </section>
  );
}
