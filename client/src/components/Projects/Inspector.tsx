import { useEffect, useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useQuery } from '@tanstack/react-query';
import { X, ExternalLink, Maximize2, Minimize2, Send } from 'lucide-react';
import { aiProjects, workspaceProject, projectTrials, QueryKeys } from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@librechat/client';
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
import { useTrialActivity } from './Activity';
import ProjectWeb from './Web';
import Graph from './Graph';
import Draft from './Draft';
type WorkView = 'prepareAssistant' | 'prepareCode' | 'preview' | 'publish' | 'operations';
const workbenchTrial = atomFamily((_key: string) => atom<AITrial | null>(null));

/** Side navigation is independent from the central chat, including its unsent input. */
export default function ProjectInspector() {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const [selection, select] = useAtom(projectInspector(user?.id ?? 'anonymous'));
  const workAtom = useMemo(() => atom<{ view: WorkView; open: boolean } | null>(null), []);
  const [dialog, setDialog] = useAtom(workAtom);
  const work = dialog?.open ? dialog.view : null;
  const [tab, setTab] = useAtom(
    useMemo(
      () => atom({ projectId: selection?.projectId, value: 'overview' }),
      [selection?.projectId],
    ),
  );
  const close = () => setDialog((previous) => previous && { ...previous, open: false });
  const [expanded, setExpanded] = useAtom(useMemo(() => atom(false), []));
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
  const currentTrial = trials.data?.trials.find(
    (v) => v.state === 'ready' && v.digest === trials.data.digest,
  );
  const recentTrial = currentTrial ?? trials.data?.trials.find((v) => v.state === 'ready');
  const selectedTrial = pinned ?? recentTrial;
  const { frame, activity, resetActivity } = useTrialActivity(selectedTrial?.agent_id);
  useEffect(() => {
    if (!pinned && recentTrial) setPinned(recentTrial);
  }, [recentTrial, pinned, setPinned]);
  const app = context.data?.application;
  const address = app ? deliveryAddress(app) : null;
  const path = context.data?.path ?? assistant?.project.path;
  const open = (view: WorkView, element?: HTMLElement) => {
    trigger.current = element ?? null;
    setDialog({ view, open: true });
  };
  useEffect(() => {
    if (
      (work === 'prepareAssistant' && assistant?.state === 'ready') ||
      (work === 'prepareCode' && id)
    )
      setDialog((previous) => previous && { ...previous, open: false });
  }, [work, assistant?.state, id, setDialog]);
  if (!selection) return null;
  let section = selection.section;
  if (section === 'overview' && assistant) section = 'assistant';
  if (section === 'overview' && id) section = 'code';
  const ready = native.isSuccess && assistants.isSuccess && (!id || context.isSuccess);
  const failed = native.isError || assistants.isError || (!!id && context.isError);
  const titles = {
    publish: 'com_project_publish',
    operations: 'com_project_operations',
    prepareCode: 'com_project_bind_code',
    prepareAssistant: 'com_project_prepare_assistant',
    preview: 'com_project_trial_records',
  } as const;
  const title = t(titles[work ?? 'preview']);
  const assistantWorkbench = ready && section === 'assistant' && !!assistant;
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
      className={`text-text-primary border-border-light absolute inset-0 z-20 flex min-h-0 min-w-0 flex-col border-s text-sm lg:static lg:z-auto lg:shrink-0 ${assistantWorkbench ? 'bg-surface-canvas' : 'bg-surface-primary'} ${expanded ? 'lg:w-3/5' : 'lg:w-2/5 lg:max-w-3xl'}`}
      aria-label={t('com_project_workbench')}
    >
      <header className="border-border-light flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold" title={project?.name}>
            {project?.name ?? t('com_ui_loading')}
            {!assistantWorkbench &&
              ' · ' + t(section === 'files' ? 'com_project_files' : 'com_project_try_pane')}
          </h2>
        </div>
        {assistantWorkbench && (
          <>
            <Button
              size="xs"
              disabled={!startup?.aiReleasesEnabled}
              onClick={(e) => open('publish', e.currentTarget)}
            >
              <Send className="size-3" aria-hidden="true" />
              {t('com_project_publish')}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden lg:inline-flex"
              aria-pressed={expanded}
              aria-label={t('com_project_workbench_expand')}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('com_ui_close')}
          onClick={() => {
            close();
            setExpanded(false);
            select(null);
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <div
        className={`min-h-0 flex-1 overflow-x-hidden ${assistantWorkbench ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        <div className={assistantWorkbench ? 'h-full' : 'flex min-h-full flex-col gap-3 p-3'}>
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
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-border-light h-[46%] min-h-0 shrink-0 border-b">
                  <Tabs
                    value={tab.value}
                    onValueChange={(value) => setTab({ ...tab, value })}
                    className="flex h-full min-h-0 flex-col"
                  >
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 px-2 py-1">
                      <TabsList>
                        <TabsTrigger value="overview">
                          {t('com_project_trace_overview')}
                        </TabsTrigger>
                        <TabsTrigger value="knowledge">
                          {t('com_project_trace_knowledge')}
                        </TabsTrigger>
                        <TabsTrigger value="config">{t('com_project_trace_config')}</TabsTrigger>
                      </TabsList>
                      <div className="flex items-center gap-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={!startup?.aiTrialsEnabled}
                          onClick={(e) => open('preview', e.currentTarget)}
                        >
                          {t('com_project_trial_records')}
                        </Button>
                        {trialPath && (
                          <Button asChild size="icon-sm" variant="ghost">
                            <a
                              href={trialPath.replace(/&trialPane=1$/, '')}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t('com_project_trial_new_tab')}
                              aria-label={t('com_project_trial_new_tab')}
                            >
                              <ExternalLink className="size-4" aria-hidden="true" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                    <TabsContent value="overview" className="mt-0 flex min-h-0 flex-1 flex-col">
                      {selectedTrial && activity?.trace?.length ? (
                        <p className="text-text-secondary px-3 text-xs">
                          {t('com_trials_version')} {selectedTrial.number}
                        </p>
                      ) : null}
                      <div className="min-h-0 flex-1">
                        <Graph
                          key={selectedTrial?.id}
                          trace={activity?.trace}
                          toolName={
                            selectedTrial?.digest === trials.data?.digest
                              ? trials.data?.available_tools?.find(
                                  (tool) => tool.reference === trials.data?.config?.tool_reference,
                                )?.service
                              : undefined
                          }
                        />
                      </div>
                    </TabsContent>
                    <TabsContent
                      forceMount
                      value="knowledge"
                      className="mt-0 min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden"
                    >
                      <div className="p-3">
                        {id && (
                          <Knowledge
                            key={id}
                            projectId={id}
                            embedded
                            inlineLibrary
                            enabled={tab.value === 'knowledge'}
                          />
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent
                      forceMount
                      value="config"
                      className="mt-0 min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden"
                    >
                      <div className="p-3">
                        {id && trials.data && <Draft key={id} projectId={id} draft={trials.data} />}
                        {trials.isLoading && <p role="status">{t('com_ui_loading')}</p>}
                        {trials.isError && (
                          <Button size="xs" variant="outline" onClick={() => void trials.refetch()}>
                            {t('com_ui_retry')}
                          </Button>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
                <section
                  aria-label={t('com_project_trial_frame')}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  {trialPath ? (
                    <iframe
                      ref={frame}
                      onLoad={resetActivity}
                      name={'starbridge-trial:' + selectedTrial?.agent_id}
                      key={selectedTrial?.id}
                      title={t('com_project_trial_frame')}
                      src={trialPath}
                      className="bg-surface-canvas min-h-0 w-full flex-1 border-0"
                    />
                  ) : (
                    <div className="border-border-light text-text-secondary grid min-h-0 flex-1 place-items-center rounded-lg border border-dashed px-3 text-center text-xs">
                      {t('com_project_trial_empty')}
                    </div>
                  )}
                </section>
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
          if (!value) close();
        }}
      >
        <OGDialogContent
          placement="center"
          className={
            work === 'publish'
              ? 'max-h-[85dvh] overflow-y-auto sm:max-w-xl'
              : 'max-h-[90vh] overflow-y-auto sm:max-w-4xl'
          }
        >
          <OGDialogTitle>{title}</OGDialogTitle>
          <OGDialogDescription>{project?.name}</OGDialogDescription>
          {work && project && (work === 'prepareAssistant' || work === 'prepareCode') && (
            <ProjectApplication
              project={project}
              focus={work === 'prepareAssistant' ? 'assistant' : 'code'}
            />
          )}
          {id && work === 'publish' && <Releases projectId={id} embedded />}
          {id && work === 'preview' && (
            <Trials
              projectId={id}
              nativeProjectId={project?._id}
              embedded
              mode={work}
              openInNewTab
              onSelectTrial={
                work === 'preview'
                  ? (trial) => {
                      setPinned(trial);
                      close();
                    }
                  : undefined
              }
            />
          )}
          {path && work === 'operations' && (
            <Applications path={path} canPublish enabled projectOnly />
          )}
          <div className="border-border-light mt-4 flex justify-end border-t pt-3">
            <Button variant="outline" onClick={close}>
              {t('com_project_return_chat')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </aside>
  );
}
