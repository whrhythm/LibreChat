import { useQuery } from '@tanstack/react-query';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { projectReleases, projectTrials, QueryKeys } from 'librechat-data-provider';
import { ArrowLeft, BookOpen, FolderOpen, Play, Settings, Send } from 'lucide-react';
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@librechat/client';
import type { AIProject } from 'librechat-data-provider';
import { projectSection, discardProjectEdits } from './navigation';
import { useAuthContext, useLocalize } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import { projectEditing } from './dock';
import Knowledge from './Knowledge';
import Releases from './Releases';
import Trials from './Trials';

/** One project at a time. Switching sections keeps unsaved form state mounted. */
export default function Project({
  value,
  enabled,
  onBack,
  onFiles,
  nativeProjectId,
}: {
  value: AIProject;
  enabled: boolean;
  onBack: () => void;
  onFiles: (path: string) => void;
  nativeProjectId?: string;
}) {
  const t = useLocalize();
  const { user, token } = useAuthContext();
  const editing = useAtomValue(projectEditing(user?.id ?? 'anonymous'));
  const { data: startup } = useGetStartupConfig();
  const [section, setSection] = useAtom(
    projectSection((user?.id ?? 'anonymous') + ':' + value.project.id),
  );
  const discard = useSetAtom(discardProjectEdits(user?.id ?? 'anonymous'));
  const id = value.project.id;
  const trials = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id, id, 'trials'],
    queryFn: () => projectTrials(token!, id),
    enabled: enabled && !!token && !!startup?.aiTrialsEnabled,
    retry: false,
  });
  const releases = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id, id, 'releases'],
    queryFn: () => projectReleases(token!, id),
    enabled: enabled && !!token && !!startup?.aiReleasesEnabled,
    retry: false,
  });
  const app = releases.data?.application;
  const active = releases.data?.releases.find((r) => r.id === app?.active_release_id);
  return (
    <section className="space-y-4" aria-label={t('com_project_detail')}>
      {!nativeProjectId && (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            if (!editing || window.confirm(t('com_project_unsaved'))) {
              discard();
              onBack();
            }
          }}
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {t('com_project_back')}
        </Button>
      )}
      <header className="space-y-2">
        <h3 className="text-base font-semibold break-words">{value.project.name}</h3>
        <p className="text-text-secondary line-clamp-2 text-xs" title={value.project.goal}>
          {value.project.goal}
        </p>
        <div className="text-text-secondary space-y-1 text-xs" role="status">
          {releases.isError || trials.isError ? (
            <p>{t('com_project_status_error')}</p>
          ) : (
            <>
              <p>
                {active
                  ? t('com_project_online', { number: active.number }) +
                    ' · ' +
                    t(app?.enabled ? 'com_releases_enabled' : 'com_releases_disabled')
                  : t(
                      releases.isLoading && startup?.aiReleasesEnabled
                        ? 'com_ui_loading'
                        : 'com_project_unpublished',
                    )}
              </p>
              {trials.data?.digest && (
                <p>
                  {t(
                    active?.digest === trials.data.digest
                      ? 'com_project_same'
                      : 'com_project_draft',
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </header>
      <Tabs
        value={section}
        onValueChange={setSection}
        orientation={nativeProjectId ? 'horizontal' : 'vertical'}
      >
        <TabsList
          variant="segmented"
          className={
            nativeProjectId
              ? 'grid h-auto w-full grid-cols-2 sm:grid-cols-4'
              : 'flex h-auto w-full flex-col items-stretch'
          }
          aria-label={t('com_project_sections')}
        >
          <TabsTrigger className="justify-start" variant="segmented" value="preview">
            <Play className="size-4" aria-hidden="true" />
            {t('com_ai_projects_try')}
          </TabsTrigger>
          <TabsTrigger className="justify-start" variant="segmented" value="materials">
            <BookOpen className="size-4" aria-hidden="true" />
            {t('com_project_materials')}
          </TabsTrigger>
          <TabsTrigger className="justify-start" variant="segmented" value="settings">
            <Settings className="size-4" aria-hidden="true" />
            {t('com_project_settings')}
          </TabsTrigger>
          <TabsTrigger className="justify-start" variant="segmented" value="publish">
            <Send className="size-4" aria-hidden="true" />
            {t('com_project_publish')}
          </TabsTrigger>
        </TabsList>
        <Button
          className="mt-2 w-full justify-start"
          variant="ghost"
          size="sm"
          onClick={() => onFiles(value.project.path)}
        >
          <FolderOpen className="size-4" aria-hidden="true" />
          {t('com_codechat_project_files')}
        </Button>
        <TabsContent
          value="materials"
          forceMount
          hidden={section !== 'materials'}
          size="flush"
          className="mt-4"
        >
          <Knowledge projectId={id} embedded enabled={enabled && section === 'materials'} />
        </TabsContent>
        <TabsContent
          value={section === 'settings' ? 'settings' : 'preview'}
          forceMount
          hidden={section !== 'settings' && section !== 'preview'}
          size="flush"
          className="mt-4"
        >
          {startup?.aiTrialsEnabled ? (
            <Trials
              projectId={id}
              embedded
              enabled={enabled && (section === 'settings' || section === 'preview')}
              mode={section === 'settings' ? 'settings' : 'preview'}
              nativeProjectId={nativeProjectId}
            />
          ) : (
            <Button size="sm" asChild>
              <a href={'/c/new?endpoint=agents&agent_id=' + encodeURIComponent(value.agent_id)}>
                {t('com_ai_projects_try')}
              </a>
            </Button>
          )}
        </TabsContent>
        <TabsContent
          value="publish"
          forceMount
          hidden={section !== 'publish'}
          size="flush"
          className="mt-4"
        >
          {startup?.aiReleasesEnabled ? (
            <Releases projectId={id} embedded enabled={enabled && section === 'publish'} />
          ) : (
            <p className="text-text-secondary text-xs">{t('com_project_publish_unavailable')}</p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
