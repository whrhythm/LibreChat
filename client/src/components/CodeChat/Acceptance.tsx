import { useMemo, useRef, useId } from 'react';
import { atom, useAtom } from 'jotai';
import { ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import {
  QueryKeys,
  taskAcceptance,
  saveTaskAcceptance,
  ProgrammingRequestError,
} from 'librechat-data-provider';
import type { AcceptanceInput, TaskAcceptance, ProgrammingTask } from 'librechat-data-provider';
import { executionEvidence } from './evidence';
import { useLocalize } from '~/hooks';

const editable = (record: TaskAcceptance): AcceptanceInput => ({
  revision: record.revision,
  goal: record.goal,
  criteria: record.criteria,
  note: record.note,
});

export default function Acceptance({
  task,
  token,
  userId,
}: {
  task: ProgrammingTask;
  token: string;
  userId: string;
}) {
  const t = useLocalize();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const client = useQueryClient();
  const state = useMemo(
    () => atom({ open: false, draft: null as AcceptanceInput | null, saved: false }),
    [],
  );
  const [value, setValue] = useAtom(state);
  const key = [QueryKeys.taskAcceptance, userId, task.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => taskAcceptance(token, task.id),
    enabled: value.open,
    retry: false,
  });
  const change = useMutation({
    mutationFn: (body: AcceptanceInput) => saveTaskAcceptance(token, task.id, body),
    onSuccess: (record) => {
      client.setQueryData(key, record);
      setValue((old) => ({ ...old, draft: null, saved: true }));
      void client.invalidateQueries([QueryKeys.programmingTask, userId, task.id]);
    },
    retry: false,
  });
  const current = query.data;
  const form = value.draft ?? (current ? editable(current) : null);
  const dirty = !!(form && current && JSON.stringify(form) !== JSON.stringify(editable(current)));
  const active = ['queued', 'running', 'awaiting_approval', 'cancelling'].includes(task.status);
  const requirementsChanged = !!(
    form &&
    current &&
    (form.goal !== current.goal ||
      JSON.stringify(form.criteria.map(({ id, text }) => ({ id, text }))) !==
        JSON.stringify(current.criteria.map(({ id, text }) => ({ id, text }))))
  );
  const evidence = executionEvidence(task.events);
  const update = (next: AcceptanceInput) =>
    setValue((old) => ({ ...old, draft: next, saved: false }));
  const close = () => {
    if (change.isLoading || (dirty && !window.confirm(t('com_codechat_acceptance_discard'))))
      return;
    setValue({ open: false, draft: null, saved: false });
  };
  return (
    <>
      <div className="space-y-1">
        <Button
          ref={trigger}
          size="xs"
          variant="outline"
          onClick={() => {
            change.reset();
            setValue({ open: true, draft: null, saved: false });
          }}
        >
          <ClipboardCheck className="size-3.5" aria-hidden="true" />
          {t('com_codechat_acceptance_title')}
        </Button>
        <p className="text-text-secondary text-xs">
          {task.acceptance?.total
            ? t('com_codechat_acceptance_summary', {
                passed: task.acceptance.passed,
                total: task.acceptance.total,
                changes: task.acceptance.changes_requested,
              })
            : t('com_codechat_acceptance_none')}
        </p>
      </div>
      <OGDialog
        open={value.open}
        triggerRef={trigger}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <OGDialogContent className="sm:max-w-2xl">
          <OGDialogTitle>{t('com_codechat_acceptance_title')}</OGDialogTitle>
          <OGDialogDescription>
            {t('com_codechat_acceptance_scope', { path: task.config.project_path })}
          </OGDialogDescription>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto text-sm">
            {query.isLoading && <p role="status">{t('com_ui_loading')}</p>}
            {query.isError && (
              <div role="alert">
                <p>{t('com_codechat_acceptance_load_failed')}</p>
                <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
                  {t('com_codechat_retry')}
                </Button>
              </div>
            )}
            {form && current && (
              <fieldset disabled={change.isLoading} className="space-y-4">
                <p className="text-text-secondary text-xs">
                  {t('com_codechat_acceptance_boundary')}
                </p>
                <details>
                  <summary className="cursor-pointer">
                    {t('com_codechat_acceptance_original')}
                  </summary>
                  <p className="mt-2 break-words whitespace-pre-wrap">
                    {current.request?.text || t('com_codechat_acceptance_legacy')}
                  </p>
                  {current.request?.truncated && <p>{t('com_codechat_acceptance_truncated')}</p>}
                </details>
                <div className="space-y-1">
                  <label htmlFor={id + '-goal'} className="font-medium">
                    {t('com_codechat_acceptance_goal')}
                  </label>
                  <textarea
                    id={id + '-goal'}
                    rows={3}
                    maxLength={4000}
                    value={form.goal}
                    className="border-border-light bg-surface-primary w-full rounded-md border p-2"
                    onChange={(event) =>
                      update({
                        ...form,
                        goal: event.target.value,
                        criteria: form.criteria.map((item) => ({ ...item, result: 'pending' })),
                      })
                    }
                  />
                </div>
                <div className="bg-surface-secondary space-y-2 rounded-lg p-3">
                  <p className="font-medium">{t('com_codechat_acceptance_evidence')}</p>
                  <p>{t('com_codechat_acceptance_commands', evidence.commands)}</p>
                  <p className="text-text-secondary text-xs">
                    {t('com_codechat_acceptance_evidence_limit')}
                  </p>
                  {evidence.files.length > 0 && (
                    <ul className="list-inside list-disc text-xs break-all">
                      {evidence.files.map((path) => (
                        <li key={path}>{path}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="font-medium">{t('com_codechat_acceptance_criteria')}</p>
                  <p className="text-text-secondary text-xs">
                    {current.source_sha256
                      ? t('com_codechat_acceptance_source', {
                          hash: current.source_sha256.slice(0, 12),
                        })
                      : t('com_codechat_acceptance_unbound')}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!form.criteria.some((item) => item.result !== 'pending')}
                    onClick={() =>
                      update({
                        ...form,
                        criteria: form.criteria.map((item) => ({ ...item, result: 'pending' })),
                      })
                    }
                  >
                    {t('com_codechat_acceptance_reset')}
                  </Button>
                  {(active || requirementsChanged) && (
                    <p className="text-text-secondary text-xs">
                      {t(
                        active
                          ? 'com_codechat_acceptance_active'
                          : 'com_codechat_acceptance_save_first',
                      )}
                    </p>
                  )}
                  {form.criteria.map((item, index) => (
                    <div key={item.id} className="flex flex-wrap items-center gap-2">
                      <Input
                        aria-label={t('com_codechat_acceptance_item', { number: index + 1 })}
                        value={item.text}
                        maxLength={400}
                        className="min-w-0 flex-1"
                        onChange={(event) =>
                          update({
                            ...form,
                            criteria: form.criteria.map((row) =>
                              row.id === item.id
                                ? { ...row, text: event.target.value, result: 'pending' }
                                : row,
                            ),
                          })
                        }
                      />
                      <select
                        aria-label={t('com_codechat_acceptance_result', { number: index + 1 })}
                        className="border-border-light bg-surface-primary rounded-md border p-2 text-sm"
                        disabled={active || requirementsChanged}
                        value={item.result}
                        onChange={(event) => {
                          const result = event.target.value;
                          if (
                            result !== 'pending' &&
                            result !== 'passed' &&
                            result !== 'changes_requested'
                          )
                            return;
                          update({
                            ...form,
                            criteria: form.criteria.map((row) =>
                              row.id === item.id ? { ...row, result } : row,
                            ),
                          });
                        }}
                      >
                        <option value="pending">{t('com_codechat_acceptance_pending')}</option>
                        <option value="passed">{t('com_codechat_acceptance_passed')}</option>
                        <option value="changes_requested">
                          {t('com_codechat_acceptance_changes')}
                        </option>
                      </select>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('com_codechat_acceptance_remove', { number: index + 1 })}
                        onClick={() =>
                          update({
                            ...form,
                            criteria: form.criteria.filter((row) => row.id !== item.id),
                          })
                        }
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={form.criteria.length >= 12}
                    onClick={() =>
                      update({
                        ...form,
                        criteria: [
                          ...form.criteria,
                          { id: crypto.randomUUID(), text: '', result: 'pending' },
                        ],
                      })
                    }
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {t('com_codechat_acceptance_add')}
                  </Button>
                </div>
                <div className="space-y-1">
                  <label htmlFor={id + '-note'}>{t('com_codechat_acceptance_note')}</label>
                  <textarea
                    id={id + '-note'}
                    rows={2}
                    maxLength={1000}
                    value={form.note}
                    className="border-border-light bg-surface-primary w-full rounded-md border p-2"
                    onChange={(event) => update({ ...form, note: event.target.value })}
                  />
                </div>
                {current.updated_at && (
                  <p className="text-text-secondary text-xs">
                    {t('com_codechat_acceptance_updated', {
                      revision: current.revision,
                      time: new Date(current.updated_at).toLocaleString(),
                    })}
                  </p>
                )}
              </fieldset>
            )}
            {change.isError && (
              <div role="alert" className="space-y-2">
                <p>
                  {t(
                    change.error instanceof ProgrammingRequestError && change.error.status === 409
                      ? 'com_codechat_acceptance_conflict'
                      : 'com_codechat_acceptance_save_failed',
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (dirty && !window.confirm(t('com_codechat_acceptance_discard'))) return;
                    const result = await query.refetch();
                    if (result.isSuccess) {
                      change.reset();
                      setValue((old) => ({ ...old, draft: null, saved: false }));
                    }
                  }}
                >
                  {t('com_codechat_acceptance_reload')}
                </Button>
              </div>
            )}
            {value.saved && <p role="status">{t('com_codechat_acceptance_saved')}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={change.isLoading} onClick={close}>
              {t('com_ui_close')}
            </Button>
            <Button
              disabled={
                !form ||
                !dirty ||
                change.isLoading ||
                query.isError ||
                form.criteria.some((item) => !item.text.trim())
              }
              onClick={() => {
                if (form) change.mutate(form);
              }}
            >
              {t('com_codechat_acceptance_save')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
