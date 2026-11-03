import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { FolderKanban } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { personalFileRequest, QueryKeys } from 'librechat-data-provider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@librechat/client';
import type { PersonalSpace, WorkspaceEntry } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import ApplicationNotice from './ApplicationNotice';
import Applications from './Applications';
import PersonalFiles from './Files';
import Capacity from './Capacity';

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

export default function PersonalSpacePanel({
  expanded,
  onExpandedChange,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const [view, setView] = useAtom(navigation(user?.id ?? 'anonymous'));
  const setPath = (path: string) => setView((current) => ({ ...current, path }));
  return (
    <div className="mx-3">
      <ApplicationNotice
        onOpen={() => {
          setView((current) => ({ ...current, pane: 'apps' }));
          onExpandedChange(true);
        }}
      />
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="codechat-space-panel"
        className="text-text-primary hover:bg-surface-hover flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
        onClick={() => onExpandedChange(!expanded)}
      >
        <FolderKanban aria-hidden="true" className="h-4 w-4" />
        {localize('com_codechat_workspace')}
      </button>
      <div
        id="codechat-space-panel"
        hidden={!expanded}
        className="text-text-secondary px-3 pb-3 text-sm"
      >
        <Capacity expanded={expanded} />
        <Tabs
          value={view.pane}
          onValueChange={(pane) => setView((current) => ({ ...current, pane }))}
        >
          <TabsList aria-label={localize('com_codechat_workspace')}>
            <TabsTrigger value="files">{localize('com_codechat_files_tab')}</TabsTrigger>
            <TabsTrigger value="apps">{localize('com_codechat_apps')}</TabsTrigger>
          </TabsList>
          <TabsContent value="files" forceMount hidden={view.pane !== 'files'} size="flush">
            <PersonalFiles
              expanded={expanded && view.pane === 'files'}
              path={view.path}
              onPathChange={setPath}
            />
          </TabsContent>
          <TabsContent value="apps" forceMount hidden={view.pane !== 'apps'} size="flush">
            <ApplicationProjects
              enabled={expanded && view.pane === 'apps'}
              path={view.path}
              onPathChange={setPath}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
