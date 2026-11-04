import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useQuery } from '@tanstack/react-query';
import { Files, PanelsTopLeft, X } from 'lucide-react';
import { personalFileRequest, QueryKeys } from 'librechat-data-provider';
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@librechat/client';
import type { PersonalSpace, WorkspaceEntry } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import ApplicationNotice from './ApplicationNotice';
import { spaceDock, spaceDirty } from './dock';
import StorageSummary from './StorageSummary';
import Applications from './Applications';
import PersonalFiles from './Files';

/** Feature-owned navigation, scoped to the signed-in identity. */
const navigation = atomFamily((_owner: string) => atom({ pane: 'files', path: '' }));

function ApplicationProjects({
  path,
  onPathChange,
  enabled,
}: {
  path: string;
  onPathChange: (path: string) => void;
  enabled: boolean;
}) {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const space = useQuery<PersonalSpace>({
    queryKey: [QueryKeys.codechatSpace, user?.id],
    queryFn: async () => (await personalFileRequest(token!, 'ensure', 'POST')).json(),
    enabled: enabled && !!token && !!user?.id,
    retry: false,
    refetchInterval: (data) => (data?.status === 'ready' ? 30000 : 5000),
  });
  const ready = enabled && !!token && space.data?.status === 'ready';
  const root = useQuery<{ entries: WorkspaceEntry[] }>({
    queryKey: [QueryKeys.codechatFiles, user?.id, ''],
    queryFn: async () => (await personalFileRequest(token!, 'directories', 'GET', '')).json(),
    enabled: ready,
    retry: false,
    refetchInterval: ready ? 5000 : false,
  });
  const folder = useQuery<{ entries: WorkspaceEntry[] }>({
    queryKey: [QueryKeys.codechatFiles, user?.id, path],
    queryFn: async () => (await personalFileRequest(token!, 'directories', 'GET', path)).json(),
    enabled: ready && !!path,
    retry: false,
    refetchInterval: ready && path ? 5000 : false,
  });
  const projects =
    root.data?.entries.filter((entry) => entry.kind === 'directory').map((entry) => entry.name) ??
    [];
  if (path && !projects.includes(path)) projects.unshift(path);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="codechat-publish-project">{localize('com_codechat_publish_project')}</label>
      <select
        id="codechat-publish-project"
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
      {(space.isError || root.isError || (path && folder.isError)) && (
        <p role="alert">{localize('com_codechat_files_error')}</p>
      )}
      {path &&
        folder.isSuccess &&
        !folder.data.entries.some(
          (entry) => entry.kind === 'file' && entry.name === 'Dockerfile',
        ) && <p>{localize('com_codechat_dockerfile_required')}</p>}
      <Applications
        path={path}
        enabled={ready}
        canPublish={
          !!path &&
          folder.data?.entries.some(
            (entry) => entry.kind === 'file' && entry.name === 'Dockerfile',
          ) === true
        }
      />
    </div>
  );
}

export default function PersonalSpacePanel() {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const [view, setView] = useAtom(navigation(user?.id ?? 'anonymous'));
  const [, setOpen] = useAtom(spaceDock(user?.id ?? 'anonymous'));
  const [dirty, setDirty] = useAtom(spaceDirty(user?.id ?? 'anonymous'));
  const allowLeave = () => !dirty || window.confirm(localize('com_codechat_file_unsaved'));
  const changePane = (pane: string) => {
    if (pane === view.pane || !allowLeave()) return;
    setDirty(false);
    setView((current) => ({ ...current, pane }));
  };
  const setPath = (path: string) => setView((current) => ({ ...current, path }));
  return (
    <section
      id="codechat-space-panel"
      aria-label={localize('com_codechat_workspace')}
      className="bg-surface-primary text-text-primary border-border-light flex h-full min-w-0 flex-col border-s text-sm"
    >
      <header className="flex shrink-0 items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">{localize('com_codechat_workspace')}</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={localize('com_codechat_space_close')}
          onClick={() => {
            if (!allowLeave()) return;
            setDirty(false);
            setOpen(false);
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="shrink-0 px-4 pb-3">
        <StorageSummary />
      </div>
      <ApplicationNotice
        onOpen={() => {
          changePane('apps');
        }}
      />
      <Tabs value={view.pane} onValueChange={changePane} className="flex min-h-0 flex-1 flex-col">
        <TabsList
          variant="segmented"
          className="mx-4 mb-2 grid shrink-0 grid-cols-2"
          aria-label={localize('com_codechat_workspace')}
        >
          <TabsTrigger variant="segmented" value="files">
            <Files className="size-4" aria-hidden="true" />
            {localize('com_codechat_files_tab')}
          </TabsTrigger>
          <TabsTrigger variant="segmented" value="apps">
            <PanelsTopLeft className="size-4" aria-hidden="true" />
            {localize('com_codechat_apps')}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          className="mx-4 mb-4 min-h-0 overflow-auto"
          value="files"
          forceMount
          hidden={view.pane !== 'files'}
          size="flush"
        >
          <PersonalFiles expanded={view.pane === 'files'} path={view.path} onPathChange={setPath} />
        </TabsContent>
        <TabsContent
          className="mx-4 mb-4 min-h-0 overflow-auto"
          value="apps"
          forceMount
          hidden={view.pane !== 'apps'}
          size="flush"
        >
          <ApplicationProjects
            enabled={view.pane === 'apps'}
            path={view.path.split('/')[0]}
            onPathChange={setPath}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
