import { X } from 'lucide-react';
import { atomFamily } from 'jotai/utils';
import { Button } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { personalFileRequest, QueryKeys } from 'librechat-data-provider';
import type { PersonalSpace, WorkspaceEntry } from 'librechat-data-provider';
import { activePanelAtom } from '~/Providers/ActivePanelContext';
import { useAuthContext, useLocalize } from '~/hooks';
import ApplicationNotice from './ApplicationNotice';
import StorageSummary from './StorageSummary';
import KnowledgeList from './KnowledgeList';
import Applications from './Applications';
import { spaceNavigation } from './dock';
import { StorageDetails } from './Usage';

const assetSection = atomFamily((_owner: string) => atom('files'));
import useAccount from './useAccount';
import PersonalFiles from './Files';

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
    refetchInterval: enabled ? (data) => (data?.status === 'ready' ? 30000 : 5000) : false,
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
  const [view, setView] = useAtom(spaceNavigation(user?.id ?? 'anonymous'));
  const active = useAtomValue(activePanelAtom) === 'personal-space';
  const setActive = useSetAtom(activePanelAtom);
  const [section, setSection] = useAtom(assetSection(user?.id ?? 'anonymous'));
  const account = useAccount(active);
  let title: 'com_codechat_workspace' | 'com_codechat_apps' | 'com_codechat_projects_tab' =
    'com_codechat_projects_tab';
  if (view.pane === 'files') title = 'com_codechat_workspace';
  if (view.pane === 'apps') title = 'com_codechat_apps';
  const setPath = (path: string) => setView((current) => ({ ...current, path }));
  return (
    <section
      id="codechat-space-panel"
      aria-label={localize(title)}
      className="bg-surface-sidebar text-text-primary flex h-full min-w-0 flex-col text-sm"
    >
      <header className="flex shrink-0 items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">{localize(title)}</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={localize('com_codechat_space_close')}
          onClick={() => setActive('conversations')}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>
      {view.pane !== 'projects' && (
        <div className="px-4 pb-3">{view.pane === 'files' && active && <StorageSummary />}</div>
      )}
      {active && view.pane === 'apps' && (
        <ApplicationNotice onOpen={() => setView((current) => ({ ...current, pane: 'apps' }))} />
      )}
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        <div hidden={view.pane !== 'files'}>
          <nav className="mb-3 flex gap-1" aria-label={localize('com_assets_sections')}>
            <Button
              size="xs"
              variant={section === 'files' ? 'outline' : 'ghost'}
              aria-pressed={section === 'files'}
              onClick={() => setSection('files')}
            >
              {localize('com_assets_files')}
            </Button>
            <Button
              size="xs"
              variant={section === 'knowledge' ? 'outline' : 'ghost'}
              aria-pressed={section === 'knowledge'}
              onClick={() => setSection('knowledge')}
            >
              {localize('com_assets_project_knowledge')}
            </Button>
          </nav>
          <div hidden={section !== 'files'}>
            <PersonalFiles
              expanded={active && view.pane === 'files' && section === 'files'}
              path={view.path}
              onPathChange={setPath}
            />
          </div>
          {section === 'knowledge' && <KnowledgeList enabled={active && view.pane === 'files'} />}
          <details className="border-border-light mt-4 border-t py-3">
            <summary className="cursor-pointer text-xs">
              {localize('com_assets_storage_details')}
            </summary>
            <div className="space-y-3 pt-3">
              <StorageDetails data={account.data} />
              <p className="text-text-secondary text-xs">
                {localize('com_assets_readonly_assets')}
              </p>
            </div>
          </details>
        </div>
        <div hidden={view.pane !== 'apps'}>
          <ApplicationProjects
            enabled={active && view.pane === 'apps'}
            path={view.path}
            onPathChange={setPath}
          />
        </div>
      </div>
    </section>
  );
}

export function DeploymentPanel() {
  const { user } = useAuthContext();
  const t = useLocalize();
  const active = useAtomValue(activePanelAtom) === 'deployed-apps';
  const [view, setView] = useAtom(spaceNavigation(user?.id ?? 'anonymous'));
  return (
    <section
      className="flex h-full min-h-0 flex-col text-sm"
      aria-label={t('com_assets_deployments')}
    >
      <header className="px-4 py-3">
        <h2 className="font-semibold">{t('com_assets_deployments')}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        <ApplicationProjects
          path={view.path}
          onPathChange={(path) => setView((current) => ({ ...current, path }))}
          enabled={active}
        />
      </div>
    </section>
  );
}
