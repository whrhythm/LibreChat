import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiProjects, createAIProject, resumeAIProject, QueryKeys } from 'librechat-data-provider';
import type { AIProjectCreateInput } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

export default function Assistants({
  enabled,
  onFiles,
}: {
  enabled: boolean;
  onFiles: (path: string) => void;
}) {
  const t = useLocalize();
  const { user, token } = useAuthContext();
  const navigate = useNavigate();
  const client = useQueryClient();
  const state = useMemo(() => atom<AIProjectCreateInput | null>(null), []);
  const [draft, setDraft] = useAtom(state);
  const list = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id],
    queryFn: () => aiProjects(token!),
    enabled: enabled && !!token,
    retry: false,
  });
  const save = useMutation({
    mutationKey: [QueryKeys.aiProjects, user?.id],
    mutationFn: (input: AIProjectCreateInput | string) =>
      typeof input === 'string' ? resumeAIProject(token!, input) : createAIProject(token!, input),
    onSuccess: () => setDraft(null),
    onSettled: () => {
      void client.invalidateQueries([QueryKeys.aiProjects, user?.id]);
      void client.invalidateQueries([QueryKeys.workspaceProjects, user?.id]);
    },
    retry: false,
  });
  if (!enabled || (!list.data?.enabled && !list.isError)) return null;
  const inputClass =
    'border-border-light bg-surface-primary text-text-primary w-full rounded border px-2 py-1.5 text-sm';
  return (
    <section
      className="border-border-light space-y-3 rounded-lg border p-3"
      aria-label={t('com_ai_projects_title')}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{t('com_ai_projects_title')}</h3>
        {!draft && list.data?.enabled && (
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              save.reset();
              setDraft({ request_id: crypto.randomUUID(), name: '', purpose: '' });
            }}
          >
            {t('com_ai_projects_create')}
          </Button>
        )}
      </div>
      <p className="text-text-secondary text-xs">{t('com_ai_projects_hint')}</p>
      {list.isError && (
        <div role="alert">
          {t('com_ai_projects_load_error')}
          <Button size="xs" variant="ghost" onClick={() => void list.refetch()}>
            {t('com_codechat_retry')}
          </Button>
        </div>
      )}
      {draft && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(draft);
          }}
        >
          <label className="block space-y-1">
            {t('com_ai_projects_name')}
            <input
              className={inputClass}
              required
              maxLength={80}
              value={draft.name}
              disabled={save.isLoading || save.isError}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="block space-y-1">
            {t('com_ai_projects_purpose')}
            <textarea
              className={inputClass}
              required
              maxLength={1000}
              rows={3}
              value={draft.purpose}
              disabled={save.isLoading || save.isError}
              onChange={(event) => setDraft({ ...draft, purpose: event.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              size="xs"
              variant="ghost"
              type="button"
              disabled={save.isLoading}
              onClick={() => {
                setDraft(null);
                save.reset();
              }}
            >
              {t('com_ui_cancel')}
            </Button>
            <Button size="xs" type="submit" disabled={save.isLoading}>
              {t(
                save.isLoading
                  ? 'com_ai_projects_preparing'
                  : save.isError
                    ? 'com_codechat_retry'
                    : 'com_ai_projects_create',
              )}
            </Button>
          </div>
        </form>
      )}
      {save.isError && (
        <p role="alert" className="text-sm">
          {t('com_ai_projects_recovery')}
        </p>
      )}
      {list.data?.projects.map((value) => (
        <article key={value.project.id} className="border-border-light space-y-2 border-t pt-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate font-medium" title={value.project.name}>
              {value.project.name}
            </h4>
            <span className="text-text-secondary shrink-0 text-xs">
              {t(value.state === 'ready' ? 'com_ai_projects_private' : 'com_ai_projects_pending')}
            </span>
          </div>
          <p className="text-text-secondary text-xs">{t('com_ai_projects_knowledge_pending')}</p>
          <div className="flex flex-wrap gap-2">
            {value.state === 'ready' ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  navigate('/c/new?endpoint=agents&agent_id=' + encodeURIComponent(value.agent_id))
                }
              >
                {t('com_ai_projects_try')}
              </Button>
            ) : (
              <Button
                size="xs"
                variant="outline"
                disabled={save.isLoading}
                onClick={() => {
                  save.reset();
                  save.mutate(value.project.id);
                }}
              >
                {t('com_ai_projects_resume')}
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => onFiles(value.project.path)}>
              {t('com_codechat_project_files')}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
