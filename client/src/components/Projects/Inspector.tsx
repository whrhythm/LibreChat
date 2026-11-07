import { useEffect, useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
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
import {
  ArrowLeft,
  Bot,
  Code2,
  Files,
  ChevronRight,
  ExternalLink,
  Play,
  Settings,
  BookOpen,
  Send,
} from 'lucide-react';
import { deliveryAddress, deliveryState } from '~/components/CodeChat/delivery';
import { useProjectQuery, useGetStartupConfig } from '~/data-provider';
import Applications from '~/components/CodeChat/Applications';
import PersonalFiles from '~/components/CodeChat/Files';
import Knowledge from '~/components/CodeChat/Knowledge';
import { useAuthContext, useLocalize } from '~/hooks';
import Releases from '~/components/CodeChat/Releases';
import Trials from '~/components/CodeChat/Trials';
import { projectInspector } from './navigation';
import ProjectApplication from './Application';
import useProjectChat from './useProjectChat';
import ProjectUsage from './Usage';

const sections = [
  { id: 'assistant', label: 'com_project_assistant', icon: Bot },
  { id: 'code', label: 'com_project_code', icon: Code2 },
  { id: 'files', label: 'com_project_files', icon: Files },
] as const;
type WorkView =
  | 'prepareAssistant'
  | 'prepareCode'
  | 'preview'
  | 'settings'
  | 'knowledge'
  | 'publish'
  | 'operations';

/** Side navigation is independent from the central chat, including its unsent input. */
export default function ProjectInspector() {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const [selection, select] = useAtom(projectInspector(user?.id ?? 'anonymous'));
  const workAtom = useMemo(() => atom<WorkView | null>(null), []);
  const [work, setWork] = useAtom(workAtom);
  const trigger = useRef<HTMLElement | null>(null);
  const startChat = useProjectChat();
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
  const section = selection.section;
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
  return (
    <section
      className="flex h-full min-h-0 flex-col text-sm"
      aria-label={t('com_project_inspector')}
    >
      <header className="border-border-light border-b px-3 py-2">
        <Button variant="ghost" size="xs" onClick={() => select(null)}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {t('com_project_back_chats')}
        </Button>
        <h2 className="mt-2 truncate px-1 text-sm font-semibold" title={project?.name}>
          {project?.name ?? t('com_ui_loading')}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <ProjectUsage compact />
        <div className="space-y-4 px-3 py-3">
          {section === 'overview' ? (
            <>
              <Button className="w-full" onClick={() => startChat(selection.projectId)}>
                <Play className="size-4" aria-hidden="true" />
                {t('com_project_start_chat')}
              </Button>
              <nav className="space-y-1" aria-label={t('com_project_sections')}>
                {sections.map(({ id: target, label, icon: Icon }) => (
                  <Button
                    key={target}
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => select({ ...selection, section: target })}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {t(label)}
                    <ChevronRight className="ms-auto size-3.5" aria-hidden="true" />
                  </Button>
                ))}
              </nav>
            </>
          ) : (
            <nav
              className="border-border-light flex gap-1 border-b pb-2"
              aria-label={t('com_project_sections')}
            >
              {sections.map(({ id: target, label, icon: Icon }) => (
                <Button
                  key={target}
                  variant={section === target ? 'outline' : 'ghost'}
                  size="xs"
                  aria-pressed={section === target}
                  className="min-w-0 flex-1"
                  onClick={() => select({ ...selection, section: target })}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{t(label)}</span>
                </Button>
              ))}
            </nav>
          )}
          {!ready && !failed && (
            <p role="status" className="text-text-secondary text-xs">
              {t('com_ui_loading')}
            </p>
          )}
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
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="font-medium break-words">{project.name}</h3>
                  <p className="text-text-secondary text-xs" role="status">
                    {releaseStatus}
                  </p>
                </div>
                {currentTrial ? (
                  <Button asChild className="w-full">
                    <a
                      href={
                        '/c/new?endpoint=agents&agent_id=' +
                        encodeURIComponent(currentTrial.agent_id) +
                        '&projectId=' +
                        encodeURIComponent(project._id)
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Play className="size-4" aria-hidden="true" />
                      {t('com_project_trial_new_tab')}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    disabled={!startup?.aiTrialsEnabled}
                    onClick={(e) => open('preview', e.currentTarget)}
                  >
                    {t('com_ai_projects_try')}
                  </Button>
                )}
                <div className="space-y-1">
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    disabled={!startup?.aiTrialsEnabled}
                    onClick={(e) => open('settings', e.currentTarget)}
                  >
                    <Settings className="size-4" aria-hidden="true" />
                    {t('com_project_settings')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={(e) => open('knowledge', e.currentTarget)}
                  >
                    <BookOpen className="size-4" aria-hidden="true" />
                    {t('com_project_materials')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    disabled={!startup?.aiTrialsEnabled}
                    onClick={(e) => open('preview', e.currentTarget)}
                  >
                    <Play className="size-4" aria-hidden="true" />
                    {t('com_project_trial_records')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
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
            <div className="space-y-3">
              <p className="text-text-secondary text-xs" role="status">
                {app
                  ? t(deliveryState(app))
                  : t(path ? 'com_project_code_unpublished' : 'com_project_no_code')}
              </p>
              {address && (
                <Button asChild className="w-full">
                  <a href={address} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" aria-hidden="true" />
                    {t('com_project_visit_app')}
                  </a>
                </Button>
              )}
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
    </section>
  );
}
