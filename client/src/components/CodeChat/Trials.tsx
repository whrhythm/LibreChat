import { useEffect, useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectTrials, AITrialError, QueryKeys } from 'librechat-data-provider';
import type { TrialConfig, AITrial, AITrials } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { projectEditing } from './dock';

function statusKey(trial: AITrial, digest: string | null) {
  if (trial.acceptance_valid) return 'com_trials_passed';
  if (trial.acceptance?.outcome === 'failed') return 'com_trials_failed';
  if (trial.digest !== digest) return 'com_trials_outdated';
  return 'com_trials_unchecked';
}

function errorMessage(code: string) {
  if (['ai_trials_draft_changed', 'ai_trials_confirmation_required'].includes(code))
    return 'com_trials_changed';
  if (['ai_trials_answer_required', 'ai_trials_session_mismatch'].includes(code))
    return 'com_trials_answer_required';
  return 'com_trials_error';
}

export default function Trials({ projectId, embedded = false, enabled = true }: { projectId: string; embedded?: boolean; enabled?: boolean }) {
  const { user, token } = useAuthContext();
  const { conversationId } = useParams();
  const t = useLocalize();
  const cache = useQueryClient();
  const state = useMemo(
    () =>
      atom({
        expanded: embedded,
        config: null as TrialConfig | null,
        baseDigest: '',
        request: null as { request_id: string; expected_digest: string } | null,
        acceptance: null as {
          trial: AITrial;
          note: string;
          answer: boolean;
          sources: boolean;
        } | null,
      }),
    [],
  );
  const [ui, setUI] = useAtom(state);
  const [, setEditing] = useAtom(projectEditing(user?.id ?? 'anonymous'));
  useEffect(() => {
    const dirty = !!ui.config || !!ui.acceptance;
    setEditing(dirty);
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { setEditing(false); window.removeEventListener('beforeunload', warn); };
  }, [ui.config, ui.acceptance, setEditing]);
  const key = [QueryKeys.aiProjects, user?.id, projectId, 'trials'];
  const list = useQuery({
    queryKey: key,
    queryFn: () => projectTrials(token!, projectId),
    enabled: enabled && ui.expanded && !!token,
    retry: false,
  });
  const change = useMutation({
    mutationFn: ({ suffix, body }: { suffix: string; body: object }) =>
      projectTrials<AITrials | AITrial>(token!, projectId, suffix, body),
    onSuccess: () =>
      setUI((current) => ({ ...current, config: null, request: null, acceptance: null })),
    onSettled: () => {
      void cache.invalidateQueries(key);
    },
    retry: false,
  });
  const data = list.data;
  const error = change.error instanceof AITrialError ? change.error.code : '';
  const errorKey = errorMessage(error);
  const inputClass =
    'border-border-light bg-surface-primary text-text-primary w-full rounded border px-2 py-1.5 text-sm';
  const busy = change.isLoading;
  let createLabel = t('com_trials_create');
  if (busy) createLabel = t('com_ai_projects_preparing');
  else if (ui.request) createLabel = t('com_trials_retry');
  const submitTrial = () => {
    if (!data?.digest) return;
    const request = ui.request ?? { request_id: crypto.randomUUID(), expected_digest: data.digest };
    setUI((current) => ({ ...current, request }));
    change.mutate({ suffix: '', body: request });
  };
  return (
    <section
      className="space-y-3"
      aria-label={t('com_trials_title')}
    >
      {!embedded && <Button
        size="xs"
        variant="outline"
        aria-expanded={ui.expanded}
        onClick={() => {
          setUI((current) => ({ ...current, expanded: !current.expanded }));
          if (!ui.expanded) void cache.invalidateQueries(key);
        }}
      >
        {t('com_trials_title')}
      </Button>}
      {ui.expanded && (
        <div className="space-y-3 text-sm">
          <h4 className="text-sm font-medium">{t('com_project_settings_heading')}</h4>
          <p className="text-text-secondary text-xs">{t('com_trials_hint')}</p>
          {(list.isError || change.isError) && <p role="alert">{t(errorKey)}</p>}
          {list.isLoading && <p role="status">{t('com_ui_loading')}</p>}
          <Button size="xs" variant="ghost" onClick={() => void list.refetch()} disabled={busy}>
            {t('com_trials_refresh')}
          </Button>
          {data && !data.config && (
            <Button
              size="xs"
              disabled={busy}
              onClick={() => change.mutate({ suffix: '/initialize', body: {} })}
            >
              {t('com_trials_initialize')}
            </Button>
          )}
          {data?.config && (
            <>
              <div className="bg-surface-secondary text-text-secondary rounded p-2 text-xs">
                {t('com_trials_draft')} #{data.revision} · {data.config.model}
                <br />
                {t('com_trials_knowledge')}:{' '}
                {data.knowledge_revision_id?.slice(0, 8) ?? t('com_trials_none')}
              </div>
              {data.unavailable_reason && <p role="alert">{t('com_trials_unavailable')}</p>}
              {!ui.config ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      change.reset();
                      setUI((current) => ({
                        ...current,
                        config: data.config,
                        baseDigest: data.digest ?? '',
                      }));
                    }}
                  >
                    {t('com_trials_edit')}
                  </Button>
                  <Button
                    size="xs"
                    disabled={busy || !data.digest || !!data.unavailable_reason}
                    onClick={submitTrial}
                  >
                    {createLabel}
                  </Button>
                </div>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    change.mutate({
                      suffix: '/update',
                      body: { config: ui.config, expected_digest: ui.baseDigest },
                    });
                  }}
                >
                  <label className="block space-y-1">
                    {t('com_trials_instructions')}
                    <textarea
                      aria-label={t('com_trials_instructions')}
                      disabled={busy}
                      className={inputClass}
                      rows={6}
                      required
                      maxLength={32000}
                      value={ui.config.instructions}
                      onChange={(event) =>
                        setUI({
                          ...ui,
                          config: { ...ui.config!, instructions: event.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="block space-y-1">
                    {t('com_trials_model')}
                    <select
                      aria-label={t('com_trials_model')}
                      disabled={busy}
                      className={inputClass}
                      value={ui.config.model}
                      onChange={(event) =>
                        setUI({ ...ui, config: { ...ui.config!, model: event.target.value } })
                      }
                    >
                      {data.models.map((model) => (
                        <option key={model}>{model}</option>
                      ))}
                    </select>
                  </label>
                  <details className="space-y-2">
                  <summary className="text-text-secondary cursor-pointer text-xs">{t('com_project_advanced')}</summary>
                  <label className="block space-y-1">
                    {t('com_trials_style')}
                    <select
                      className={inputClass}
                      value={ui.config.response_style}
                      aria-label={t('com_trials_style')}
                      disabled={busy}
                      onChange={(event) =>
                        setUI({
                          ...ui,
                          config: {
                            ...ui.config!,
                            response_style: event.target.value as TrialConfig['response_style'],
                          },
                        })
                      }
                    >
                      <option value="grounded">{t('com_trials_grounded')}</option>
                      <option value="support">{t('com_trials_support')}</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      {t('com_trials_temperature')}
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        aria-label={t('com_trials_temperature')}
                        disabled={busy}
                        max={2}
                        step={0.1}
                        required
                        value={ui.config.temperature}
                        onChange={(event) =>
                          setUI({
                            ...ui,
                            config: { ...ui.config!, temperature: Number(event.target.value) },
                          })
                        }
                      />
                    </label>
                    <label>
                      {t('com_trials_output')}
                      <input
                        className={inputClass}
                        type="number"
                        min={256}
                        aria-label={t('com_trials_output')}
                        disabled={busy}
                        max={data.output_limit}
                        required
                        value={ui.config.max_output_tokens}
                        onChange={(event) =>
                          setUI({
                            ...ui,
                            config: {
                              ...ui.config!,
                              max_output_tokens: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  </details>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="xs"
                      variant="ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => setUI({ ...ui, config: null })}
                    >
                      {t('com_ui_cancel')}
                    </Button>
                    <Button size="xs" type="submit" disabled={busy || !ui.baseDigest}>
                      {t('com_trials_save')}
                    </Button>
                  </div>
                </form>
              )}
              {!!data.trials.length && <h4 className="border-border-light border-t pt-3 text-sm font-medium">{t('com_project_previews')}</h4>}
              {data.trials.map((trial, index) => (
                <details
                  key={trial.id}
                  open={index === 0 || (!!conversationId && trial.conversation_ids?.includes(conversationId))}
                  className="border-border-light space-y-2 border-b py-2"
                  aria-label={t('com_trials_version') + ' ' + trial.number}
                >
                  <summary className="cursor-pointer text-xs">
                    <strong>
                      {t('com_trials_version')} {trial.number}
                    </strong>
                    <span className="text-text-secondary text-xs">
                      {t(statusKey(trial, data.digest))}
                    </span>
                  </summary>
                  <p className="text-text-secondary text-xs break-all">
                    {trial.model} · {t('com_trials_knowledge')}{' '}
                    {trial.knowledge_revision_id?.slice(0, 8) ?? t('com_trials_none')}
                  </p>
                  {trial.acceptance && <p className="text-xs">{trial.acceptance.note}</p>}
                  <div className="flex flex-wrap gap-2">
                    {trial.state === 'ready' ? (
                      <Button size="xs" asChild>
                        <a href={'/c/new?endpoint=agents&agent_id=' + trial.agent_id}>
                          {t('com_trials_open')}
                        </a>
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        disabled={busy}
                        onClick={() =>
                          change.mutate({ suffix: '/' + trial.id + '/resume', body: {} })
                        }
                      >
                        {t('com_trials_retry')}
                      </Button>
                    )}
                    {trial.conversation_ids?.[0] && (
                      <Button size="xs" variant="outline" asChild>
                        <a href={'/c/' + trial.conversation_ids[0]}>{t('com_trials_continue')}</a>
                      </Button>
                    )}
                    {!trial.acceptance &&
                      conversationId &&
                      trial.conversation_ids?.includes(conversationId) && (
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            setUI({
                              ...ui,
                              acceptance: { trial, note: '', answer: false, sources: false },
                            })
                          }
                        >
                          {t('com_trials_review')}
                        </Button>
                      )}
                  </div>
                </details>
              ))}
              {ui.acceptance && (
                <form
                  className="border-border-light space-y-2 rounded border p-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const outcome =
                      (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ===
                      'failed'
                        ? 'failed'
                        : 'passed';
                    change.mutate({
                      suffix: '/' + ui.acceptance!.trial.id + '/acceptance',
                      body: {
                        conversation_id: conversationId,
                        outcome,
                        note: ui.acceptance!.note,
                        answer_checked: ui.acceptance!.answer,
                        sources_checked: ui.acceptance!.sources,
                      },
                    });
                  }}
                >
                  <strong>
                    {t('com_trials_review')} · {ui.acceptance.trial.number}
                  </strong>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={ui.acceptance.answer}
                      onChange={(event) =>
                        setUI({
                          ...ui,
                          acceptance: { ...ui.acceptance!, answer: event.target.checked },
                        })
                      }
                    />
                    {t('com_trials_answer_check')}
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={ui.acceptance.sources}
                      onChange={(event) =>
                        setUI({
                          ...ui,
                          acceptance: { ...ui.acceptance!, sources: event.target.checked },
                        })
                      }
                    />
                    {t('com_trials_source_check')}
                  </label>
                  <label className="block">
                    {t('com_trials_note')}
                    <textarea
                      className={inputClass}
                      required
                      maxLength={2000}
                      aria-label={t('com_trials_note')}
                      disabled={busy}
                      rows={2}
                      value={ui.acceptance.note}
                      onChange={(event) =>
                        setUI({
                          ...ui,
                          acceptance: { ...ui.acceptance!, note: event.target.value },
                        })
                      }
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="xs"
                      type="submit"
                      value="passed"
                      disabled={
                        busy ||
                        !ui.acceptance.answer ||
                        !ui.acceptance.sources ||
                        ui.acceptance.trial.digest !== data.digest
                      }
                    >
                      {t('com_trials_pass')}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      type="submit"
                      value="failed"
                      disabled={busy}
                    >
                      {t('com_trials_fail')}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      type="button"
                      onClick={() => setUI({ ...ui, acceptance: null })}
                    >
                      {t('com_ui_cancel')}
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
