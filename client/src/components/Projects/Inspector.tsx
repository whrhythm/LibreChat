import { useEffect, useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useQuery } from '@tanstack/react-query';
import { X, ExternalLink, Play, Settings, BookOpen, Send } from 'lucide-react';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import {
  aiProjects,
  workspaceProject,
  projectTrials,
  projectReleases,
  QueryKeys,
} from 'librechat-data-provider';
import type { AITrial } from 'librechat-data-provider';
import { useProjectQuery, useGetStartupConfig } from '~/data-provider';
import { deliveryAddress } from '~/components/CodeChat/delivery';
import Applications from '~/components/CodeChat/Applications';
import PersonalFiles from '~/components/CodeChat/Files';
import Knowledge from '~/components/CodeChat/Knowledge';
import { useAuthContext, useLocalize } from '~/hooks';
import Releases from '~/components/CodeChat/Releases';
import Trials from '~/components/CodeChat/Trials';
import { projectInspector } from './navigation';
import ProjectApplication from './Application';
import ProjectWeb from './Web';
type WorkView =
  | 'prepareAssistant'
  | 'prepareCode'
  | 'preview'
  | 'settings'
  | 'knowledge'
  | 'publish'
  | 'operations';
const workbenchTrial = atomFamily((_key: string) => atom<AITrial | null>(null));

/** Side navigation is independent from the central chat, including its unsent input. */
export default function ProjectInspector() {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const [selection, select] = useAtom(projectInspector(user?.id ?? 'anonymous'));
  const workAtom = useMemo(() => atom<WorkView | null>(null), []);
  const [work, setWork] = useAtom(workAtom);
  const trigger = useRef<HTMLElement | null>(null);
  const [pinned, setPinned] = useAtom(
    workbenchTrial((user?.id ?? 'anonymous') + ':' + (selection?.projectId ?? '')),
  );
  const native = useProjectQuery(selection?.projectId ?? '', { enabled: !!selection });
  const project = native.data;
  const id = project?.platformProjectId;
  const { data: startup } = useGetStartupConfig();
  const assistants = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id],
    queryFn: () => aiProjects(token!),
    enabled: !!token && !!project,
    retry: false,
  });
  const assistant = assistants.data?.projects.find((a) => a.project.id === id);
  const context = useQuery({
    queryKey: [QueryKeys.workspaceProject, user?.id, id],
    queryFn: () => workspaceProject(token!, id!),
    enabled: !!token && !!id,
    retry: false,
    refetchInterval: id ? 10000 : false,
  });
  const trials = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id, id, 'trials'],
    queryFn: () => projectTrials(token!, id!),
    enabled: !!token && !!id && !!assistant && !!startup?.aiTrialsEnabled,
    retry: false,
  });
  const releases = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id, id, 'releases'],
    queryFn: () => projectReleases(token!, id!),
    enabled: !!token && !!id && !!assistant && !!startup?.aiReleasesEnabled,
    retry: false,
  });
  const currentTrial = trials.data?.trials.find(
    (v) => v.state === 'ready' && v.digest === trials.data.digest,
  );
  const selectedTrial = pinned ?? currentTrial;
  useEffect(() => {
    if (!pinned && currentTrial) setPinned(currentTrial);
  }, [currentTrial, pinned, setPinned]);
  const activeRelease = releases.data?.releases.find(
    (v) => v.id === releases.data.application?.active_release_id,
  );
  const app = context.data?.application;
  const address = app ? deliveryAddress(app) : null;
  const path = context.data?.path ?? assistant?.project.path;
  const open = (view: WorkView, element: HTMLElement) => {
    trigger.current = element;
    setWork(view);
  };
  useEffect(() => {
    if (
      (work === 'prepareAssistant' && assistant?.state === 'ready') ||
      (work === 'prepareCode' && id)
    )
      setWork(null);
  }, [work, assistant?.state, id, setWork]);
  if (!selection) return null;
  let section = selection.section;
  if (section === 'overview' && assistant) section = 'assistant';
  if (section === 'overview' && id) section = 'code';
  const ready = native.isSuccess && assistants.isSuccess && (!id || context.isSuccess);
  const failed = native.isError || assistants.isError || (!!id && context.isError);
  const titles = {
    settings: 'com_project_settings',
    knowledge: 'com_project_materials',
    publish: 'com_project_publish',
    operations: 'com_project_operations',
    prepareCode: 'com_project_bind_code',
    prepareAssistant: 'com_project_prepare_assistant',
    preview: 'com_ai_projects_try',
  } as const;
  const title = t(titles[work ?? 'preview']);
  let releaseStatus = t('com_project_unpublished');
  if (activeRelease)
    releaseStatus =
      t('com_project_online', { number: activeRelease.number }) +
      ' · ' +
      t(releases.data?.application?.enabled ? 'com_releases_enabled' : 'com_releases_disabled');
  if (releases.isLoading && startup?.aiReleasesEnabled) releaseStatus = t('com_ui_loading');
  if (releases.isError) releaseStatus = t('com_project_status_error');
  const style = trials.data?.config?.response_style;
  const styleKey = style === 'support' ? 'com_trials_support' : 'com_trials_grounded';
  let trialPath = '';
  if (selectedTrial && project) {
    const conversation = selectedTrial.conversation_ids?.[0];
    const params = new URLSearchParams({
      endpoint: 'agents',
      agent_id: selectedTrial.agent_id,
      projectId: project._id,
      trialPane: '1',
    });
    trialPath = '/c/' + encodeURIComponent(conversation ?? 'new') + '?' + params.toString();
  }
  return (
    <aside
      className="bg-surface-primary border-border-light absolute inset-0 z-20 flex min-h-0 min-w-0 flex-col border-s text-sm lg:static lg:z-auto lg:w-2/5 lg:max-w-3xl lg:shrink-0"
      aria-label={t('com_project_workbench')}
    >
      <header className="border-border-light flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 truncate text-sm font-semibold" title={project?.name}>
          {project?.name ?? t('com_ui_loading')} ·{' '}
          {t(section === 'files' ? 'com_project_files' : 'com_project_try_pane')}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('com_ui_close')}
          onClick={() => {
            setWork(null);
            setPinned(null);
            select(null);
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex min-h-full flex-col gap-3 p-3">
          {!ready && !failed && (
            <p role="status" className="text-text-secondary text-xs">
              {t('com_ui_loading')}
            </p>
          )}
          {ready && project && section === 'overview' && <ProjectApplication project={project} />}
          {failed && (
            <div role="alert" className="space-y-2 text-xs">
              <p>{t('com_project_status_error')}</p>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  void native.refetch();
                  void assistants.refetch();
                  if (id) void context.refetch();
                }}
              >
                {t('com_ui_retry')}
              </Button>
            </div>
          )}
          {ready &&
            project &&
            section === 'assistant' &&
            (assistant ? (
              <div className="flex min-h-[28rem] flex-1 flex-col gap-3">
                <div className="space-y-1">
                  <h3 className="font-medium break-words">{project.name}</h3>
                  <p className="text-text-secondary text-xs" role="status">
                    {releaseStatus}
                  </p>
                </div>
                {!trialPath && (
                  <Button
                    className="w-full"
                    disabled={!startup?.aiTrialsEnabled}
                    onClick={(e) => open('preview', e.currentTarget)}
                  >
                    {t('com_ai_projects_try')}
                  </Button>
                )}
                {selectedTrial && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {t('com_trials_version')} {selectedTrial.number}
                    </span>
                    <Button asChild size="xs" variant="ghost">
                      <a
                        href={trialPath.replace(/&trialPane=1$/, '')}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="size-3" aria-hidden="true" />
                        {t('com_project_trial_new_tab')}
                      </a>
                    </Button>
                    {currentTrial && currentTrial.id !== selectedTrial.id && (
                      <Button size="xs" onClick={() => setPinned(currentTrial)}>
                        {t('com_project_trial_switch')}
                      </Button>
                    )}
                    {!currentTrial && trials.data?.digest && (
                      <Button size="xs" onClick={(e) => open('preview', e.currentTarget)}>
                        {t('com_project_trial_switch')}
                      </Button>
                    )}
                  </div>
                )}
                <details className="border-border-light rounded-lg border p-2">
                  <summary className="cursor-pointer font-medium">
                    {t('com_project_capabilities')}
                  </summary>
                  <dl className="text-text-secondary mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
                    <dt>{t('com_project_capability_tool')}</dt>
                    <dd>
                      {t(
                        trials.data?.knowledge_revision_id
                          ? 'com_project_tool_linked'
                          : 'com_project_tool_missing',
                      )}
                    </dd>
                    <dt>{t('com_project_capability_skill')}</dt>
                    <dd>{t(style ? styleKey : 'com_project_capability_none')}</dd>
                    <dt>{t('com_project_capability_mcp')}</dt>
                    <dd>{t('com_project_mcp_missing')}</dd>
                  </dl>
                </details>
                {trialPath && (
                  <iframe
                    key={selectedTrial?.id}
                    title={t('com_project_trial_frame')}
                    src={trialPath}
                    className="border-border-light min-h-80 w-full flex-1 rounded border"
                  />
                )}
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={!startup?.aiTrialsEnabled}
                    onClick={(e) => open('settings', e.currentTarget)}
                  >
                    <Settings className="size-4" aria-hidden="true" />
                    {t('com_project_settings')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={(e) => open('knowledge', e.currentTarget)}
                  >
                    <BookOpen className="size-4" aria-hidden="true" />
                    {t('com_project_materials')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={!startup?.aiTrialsEnabled}
                    onClick={(e) => open('preview', e.currentTarget)}
                  >
                    <Play className="size-4" aria-hidden="true" />
                    {t('com_project_trial_records')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={!startup?.aiReleasesEnabled}
                    onClick={(e) => open('publish', e.currentTarget)}
                  >
                    <Send className="size-4" aria-hidden="true" />
                    {t('com_project_publish')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-text-secondary text-xs">
                  {t(id ? 'com_project_no_assistant_link' : 'com_project_no_assistant')}
                </p>
                {!id && (
                  <Button
                    className="w-full"
                    onClick={(e) => open('prepareAssistant', e.currentTarget)}
                  >
                    {t('com_project_prepare_assistant')}
                  </Button>
                )}
              </div>
            ))}
          {ready && project && section === 'code' && (
            <div className="flex min-h-[28rem] flex-1 flex-col gap-3">
              {path && <ProjectWeb path={path} deployed={address} />}
              {path ? (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={(e) => open('operations', e.currentTarget)}
                >
                  {t('com_project_operations')}
                </Button>
              ) : (
                !id && (
                  <Button className="w-full" onClick={(e) => open('prepareCode', e.currentTarget)}>
                    {t('com_project_bind_code')}
                  </Button>
                )
              )}
            </div>
          )}
          {ready &&
            section === 'files' &&
            (path ? (
              <PersonalFiles key={path} expanded rootPath={path} />
            ) : (
              <p className="text-text-secondary text-xs">{t('com_project_no_files')}</p>
            ))}
        </div>
      </div>
      <OGDialog
        open={work !== null}
        triggerRef={trigger}
        onOpenChange={(value) => {
          if (!value) setWork(null);
        }}
      >
        <OGDialogContent placement="center" className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <OGDialogTitle>{title}</OGDialogTitle>
          <OGDialogDescription>{project?.name}</OGDialogDescription>
          {work && project && (work === 'prepareAssistant' || work === 'prepareCode') && (
            <ProjectApplication
              project={project}
              focus={work === 'prepareAssistant' ? 'assistant' : 'code'}
            />
          )}
          {id && (work === 'preview' || work === 'settings') && (
            <Trials
              projectId={id}
              nativeProjectId={project?._id}
              embedded
              mode={work}
              openInNewTab
            />
          )}
          {id && work === 'knowledge' && <Knowledge projectId={id} embedded />}
          {id && work === 'publish' && <Releases projectId={id} embedded />}
          {path && work === 'operations' && (
            <Applications path={path} canPublish enabled projectOnly />
          )}
          <div className="border-border-light mt-4 flex justify-end border-t pt-3">
            <Button variant="outline" onClick={() => setWork(null)}>
              {t('com_project_return_chat')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </aside>
  );
}
