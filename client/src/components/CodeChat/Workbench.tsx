import { useEffect, useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { Settings2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import {
  QueryKeys,
  programmingPreference,
  saveProgrammingPreference,
  personalFileRequest,
} from 'librechat-data-provider';
import type { ProgrammingPreference, WorkspaceEntry } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import NewFolder from './NewFolder';
import MCP from './MCP';

export default function Workbench({
  conversationId,
  model,
  models,
  chooseModel,
  disabled,
}: {
  conversationId: string;
  model?: string | null;
  models?: string[];
  chooseModel: (model: string) => void;
  disabled: boolean;
}) {
  const t = useLocalize();
  const { token, user } = useAuthContext();
  const query = useQueryClient();
  const trigger = useRef<HTMLButtonElement>(null);
  const openState = useMemo(() => atom(false), []);
  const draftState = useMemo(() => atom<ProgrammingPreference | null>(null), []);
  const browseState = useMemo(() => atom(''), []);
  const [open, setOpen] = useAtom(openState);
  const [draft, setDraft] = useAtom(draftState);
  const [browse, setBrowse] = useAtom(browseState);
  useEffect(() => {
    setDraft(null);
    setBrowse('');
  }, [conversationId, setDraft, setBrowse]);
  const preferences = useQuery({
    queryKey: [QueryKeys.programmingPreference, user?.id, conversationId],
    queryFn: () => programmingPreference(token!, conversationId),
    enabled: !!token,
    retry: 1,
  });
  const directories = useQuery<{ entries: WorkspaceEntry[] }>({
    queryKey: [QueryKeys.codechatFiles, user?.id, browse],
    queryFn: async () => (await personalFileRequest(token!, 'directories', 'GET', browse)).json(),
    enabled: open && !!token,
    retry: 1,
  });
  const config = draft ?? preferences.data;
  const change = (patch: Partial<ProgrammingPreference>) =>
    config && setDraft({ ...config, ...patch });
  const save = useMutation({
    mutationFn: () => saveProgrammingPreference(token!, config!),
    onSuccess: async () => {
      setDraft(null);
      await query.invalidateQueries([QueryKeys.programmingPreference, user?.id]);
    },
    retry: false,
  });
  const selectStyle =
    'border-border-light bg-surface-primary text-text-primary rounded-theme-control w-full border px-3 py-2 text-sm';
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="xs"
        onClick={() => setOpen(true)}
        aria-label={t('com_codechat_programming_settings')}
      >
        <Settings2 className="size-4" aria-hidden="true" />
        {t('com_codechat_programming_settings')}
      </Button>
      <OGDialog open={open} onOpenChange={setOpen} triggerRef={trigger}>
        <OGDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <OGDialogTitle>{t('com_codechat_programming_settings')}</OGDialogTitle>
          <OGDialogDescription>{t('com_codechat_programming_description')}</OGDialogDescription>
          {preferences.isLoading && <p role="status">{t('com_ui_loading')}</p>}
          {preferences.isError && (
            <p role="alert">
              {t('com_codechat_programming_error')}{' '}
              <Button variant="ghost" size="xs" onClick={() => void preferences.refetch()}>
                {t('com_codechat_retry')}
              </Button>
            </p>
          )}
          {config && (
            <section className="space-y-4">
              <label className="block space-y-1 text-sm">
                {t('com_codechat_programming_model')}
                <select
                  className={selectStyle}
                  value={model ?? ''}
                  disabled={disabled}
                  onChange={(event) => chooseModel(event.target.value)}
                >
                  {models?.map((name) => (
                    <option value={name} key={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="border-border-light space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {t('com_codechat_programming_project')}:{' '}
                  <span className="font-mono break-all">
                    {config.project_path || t('com_codechat_programming_choose')}
                  </span>
                </p>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={!browse}
                    onClick={() => setBrowse(browse.split('/').slice(0, -1).join('/'))}
                  >
                    {t('com_codechat_folder_up')}
                  </Button>
                  <span className="truncate" title={browse || '/'}>
                    {browse || '/'}
                  </span>
                  <NewFolder
                    path={browse}
                    onCreated={(path) => {
                      setBrowse(path);
                      change({ project_path: path });
                    }}
                  />
                </div>
                {directories.isError && (
                  <p role="alert" className="text-xs">
                    {t('com_codechat_files_error')}
                  </p>
                )}
                <div className="max-h-32 overflow-auto">
                  {directories.data?.entries
                    .filter((entry) => entry.kind === 'directory')
                    .map((entry) => (
                      <Button
                        key={entry.name}
                        size="xs"
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => setBrowse((browse ? browse + '/' : '') + entry.name)}
                      >
                        {entry.name}/
                      </Button>
                    ))}
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!browse}
                  onClick={() => change({ project_path: browse })}
                >
                  {t('com_codechat_programming_select_folder')}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  {t('com_codechat_programming_strategy')}
                  <select
                    className={selectStyle}
                    value={config.strategy}
                    onChange={(event) =>
                      change({ strategy: event.target.value as ProgrammingPreference['strategy'] })
                    }
                  >
                    <option value="implement">{t('com_codechat_strategy_implement')}</option>
                    <option value="plan">{t('com_codechat_strategy_plan')}</option>
                    <option value="review">{t('com_codechat_strategy_review')}</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  {t('com_codechat_programming_approval')}
                  <select
                    className={selectStyle}
                    value={config.approval}
                    onChange={(event) =>
                      change({ approval: event.target.value as ProgrammingPreference['approval'] })
                    }
                  >
                    <option value="strict">{t('com_codechat_approval_strict')}</option>
                    <option value="workspace_auto">{t('com_codechat_approval_project')}</option>
                  </select>
                </label>
              </div>
              <p className="text-text-secondary text-xs">{t('com_codechat_programming_safety')}</p>
              {open && (
                <MCP
                  selected={config.mcp_servers ?? []}
                  onChange={(mcp_servers) => change({ mcp_servers })}
                />
              )}
              <Button
                disabled={save.isLoading || !config.project_path || !draft}
                onClick={() => save.mutate()}
              >
                {t('com_codechat_programming_save')}
              </Button>
              {save.isSuccess && !draft && (
                <p role="status" className="text-sm">
                  {t('com_codechat_programming_saved')}
                </p>
              )}
              {save.isError && (
                <p role="alert" className="text-sm">
                  {t('com_codechat_programming_error')}
                </p>
              )}
            </section>
          )}
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
