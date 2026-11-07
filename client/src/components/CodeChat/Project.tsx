import { useMemo } from 'react';
import { atom, useAtom, useAtomValue } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FolderOpen } from 'lucide-react';
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@librechat/client';
import { projectReleases, projectTrials, QueryKeys } from 'librechat-data-provider';
import type { AIProject } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import Knowledge from './Knowledge';
import Releases from './Releases';
import Trials from './Trials';
import { projectEditing } from './dock';

/** One project at a time. Switching sections keeps unsaved form state mounted. */
export default function Project({ value, enabled, onBack, onFiles }: {
  value: AIProject;
  enabled: boolean;
  onBack: () => void;
  onFiles: (path: string) => void;
}) {
  const t = useLocalize();
  const { user, token } = useAuthContext();
  const editing = useAtomValue(projectEditing(user?.id ?? 'anonymous'));
  const { data: startup } = useGetStartupConfig();
  const state = useMemo(() => atom('settings'), []);
  const [section, setSection] = useAtom(state);
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
      <Button size="xs" variant="ghost" onClick={() => { if (!editing || window.confirm(t('com_project_unsaved'))) onBack(); }}>
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {t('com_project_back')}
      </Button>
      <header className="space-y-2">
        <h3 className="break-words text-base font-semibold">{value.project.name}</h3>
        <p className="text-text-secondary text-xs break-words">{value.project.goal}</p>
        <div className="bg-surface-secondary space-y-1 rounded-lg p-2.5 text-xs" role="status">
          {releases.isError || trials.isError ? (
            <p>{t('com_project_status_error')}</p>
          ) : (
            <>
              <p>{active
                ? t('com_project_online', { number: active.number }) + ' · ' + t(app?.enabled ? 'com_releases_enabled' : 'com_releases_disabled')
                : t(releases.isLoading && startup?.aiReleasesEnabled ? 'com_ui_loading' : 'com_project_unpublished')}</p>
              {trials.data?.digest && <p>{t(active?.digest === trials.data.digest ? 'com_project_same' : 'com_project_draft')}</p>}
            </>
          )}
        </div>
      </header>
      <Tabs value={section} onValueChange={setSection}>
        <TabsList variant="segmented" className="grid w-full grid-cols-3" aria-label={t('com_project_sections')}>
          <TabsTrigger variant="segmented" value="materials">{t('com_project_materials')}</TabsTrigger>
          <TabsTrigger variant="segmented" value="settings">{t('com_project_settings')}</TabsTrigger>
          <TabsTrigger variant="segmented" value="publish">{t('com_project_publish')}</TabsTrigger>
        </TabsList>
        <TabsContent value="materials" forceMount hidden={section !== 'materials'} size="flush" className="mt-4 space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">{t('com_project_files')}</h4>
            <p className="text-text-secondary text-xs">{t('com_project_files_hint')}</p>
            <Button variant="outline" size="xs" onClick={() => onFiles(value.project.path)}>
              <FolderOpen className="size-3.5" aria-hidden="true" />{t('com_codechat_project_files')}
            </Button>
          </div>
          <Knowledge projectId={id} embedded enabled={enabled && section === 'materials'} />
        </TabsContent>
        <TabsContent value="settings" forceMount hidden={section !== 'settings'} size="flush" className="mt-4">
          {startup?.aiTrialsEnabled ? <Trials projectId={id} embedded enabled={enabled && section === 'settings'} /> : (
            <Button size="sm" asChild><a href={'/c/new?endpoint=agents&agent_id=' + encodeURIComponent(value.agent_id)}>{t('com_ai_projects_try')}</a></Button>
          )}
        </TabsContent>
        <TabsContent value="publish" forceMount hidden={section !== 'publish'} size="flush" className="mt-4">
          {startup?.aiReleasesEnabled ? <Releases projectId={id} embedded enabled={enabled && section === 'publish'} /> : <p className="text-text-secondary text-xs">{t('com_project_publish_unavailable')}</p>}
        </TabsContent>
      </Tabs>
    </section>
  );
}
