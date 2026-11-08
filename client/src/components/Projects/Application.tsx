import { useState } from 'react';
import { useSetAtom } from 'jotai';
import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  aiProjects,
  createAIProject,
  workspaceProject,
  saveWorkspaceProject,
  projectRootPath,
  ProjectRequestError,
  QueryKeys,
} from 'librechat-data-provider';
import type { TChatProject } from 'librechat-data-provider';
import { activePanelAtom } from '~/Providers/ActivePanelContext';
import { spaceNavigation } from '~/components/CodeChat/dock';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import { useAuthContext, useLocalize } from '~/hooks';
import Delivery from '~/components/CodeChat/Delivery';
import Project from '~/components/CodeChat/Project';

export default function ProjectApplication({
  project,
  focus,
}: {
  project: TChatProject;
  focus?: 'assistant' | 'code';
}) {
  const navigate = useNavigate();
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const cache = useQueryClient();
  const [path, setPath] = useState('');
  const pending = project.platformLinkIntent;
  const setSpace = useSetAtom(spaceNavigation(user?.id ?? 'anonymous'));
  const setActive = useSetAtom(activePanelAtom);
  const { setSidebarOpen } = useSidebarToggle();
  const list = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id],
    queryFn: () => aiProjects(token!),
    enabled: !!token,
    retry: false,
  });
  const workspace = useQuery({
    queryKey: [QueryKeys.workspaceProject, user?.id, project.platformProjectId],
    queryFn: () => workspaceProject(token!, project.platformProjectId!),
    enabled: !!token && !!project.platformProjectId,
    retry: false,
  });
  const create = useMutation({
    mutationFn: () =>
      createAIProject(token!, {
        request_id: crypto.randomUUID(),
        native_project_id: project._id,
        name: project.name.slice(0, 80),
        purpose: (project.description || project.name).slice(0, 1000),
      }),
    onSuccess: () => {
      void cache.invalidateQueries([QueryKeys.project, project._id]);
      void cache.invalidateQueries([QueryKeys.projects]);
      void cache.invalidateQueries([QueryKeys.aiProjects, user?.id]);
    },
    onSettled: () => void cache.invalidateQueries([QueryKeys.project, project._id]),
    retry: false,
  });
  const value = list.data?.projects.find((item) => item.project.id === project.platformProjectId);
  const bindCode = useMutation({
    mutationFn: () =>
      saveWorkspaceProject(token!, {
        native_project_id: project._id,
        name: project.name.slice(0, 80),
        goal: (project.description ?? '').slice(0, 1000),
        path: pending?.path ?? path,
        revision: 0,
      }),
    onSuccess: () => {
      void cache.invalidateQueries([QueryKeys.project, project._id]);
      void cache.invalidateQueries([QueryKeys.projects]);
    },
    onSettled: () => void cache.invalidateQueries([QueryKeys.project, project._id]),
    retry: false,
  });
  const open = (pane: 'files' | 'apps', path: string) => {
    setSpace({ pane, path });
    setActive('personal-space');
    setSidebarOpen(true);
  };
  return (
    <section
      className="mx-auto w-full max-w-4xl space-y-4 px-4 py-4"
      aria-label={t('com_project_application')}
    >
      {value?.state !== 'ready' && <h1 className="text-lg font-semibold">{project.name}</h1>}
      {(list.isLoading || workspace.isFetching || create.isLoading) && (
        <p role="status" className="text-sm">
          {t('com_ui_loading')}
        </p>
      )}
      {(list.isError || workspace.isError || create.isError || bindCode.isError) && (
        <p role="alert">{t('com_ai_projects_recovery')}</p>
      )}
      {pending && (
        <p role="status" className="text-sm">
          {t('com_project_link_pending')}
        </p>
      )}
      {value?.state === 'ready' && !focus ? (
        <Project
          value={{
            ...value,
            project: { ...value.project, name: project.name, goal: project.description ?? '' },
          }}
          enabled
          onBack={() => navigate('/projects')}
          onFiles={(path) => open('files', path)}
          nativeProjectId={project._id}
        />
      ) : (
        focus !== 'code' &&
        (!project.platformProjectId || value?.state === 'preparing') && (
          <Button
            disabled={
              create.isLoading || bindCode.isLoading || !list.isSuccess || pending?.kind === 'code'
            }
            onClick={() => create.mutate()}
          >
            {t('com_project_prepare_assistant')}
          </Button>
        )
      )}
      {focus !== 'assistant' && !project.platformProjectId && pending?.kind !== 'assistant' && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            bindCode.mutate();
          }}
        >
          <label className="block text-sm">
            {t('com_project_folder_new')}
            <input
              className="border-border-light bg-surface-primary mt-1 block w-full rounded border p-2"
              value={pending?.path ?? path}
              readOnly={!!pending}
              onChange={(event) => setPath(event.target.value)}
              required
              maxLength={80}
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={
                bindCode.isLoading ||
                create.isLoading ||
                !projectRootPath.safeParse(pending?.path ?? path).success
              }
            >
              {t('com_codechat_project_associate')}
            </Button>
          </div>
          {bindCode.error instanceof ProjectRequestError &&
            bindCode.error.code === 'projects_root_exists' && (
              <p role="alert" className="text-text-secondary text-xs">
                {t('com_project_folder_exists')}
              </p>
            )}
        </form>
      )}
      {!focus && workspace.data && value?.state !== 'ready' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => open('files', workspace.data.path)}>
            {t('com_codechat_project_files')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => open('apps', workspace.data.path)}>
            {t('com_codechat_apps')}
          </Button>
        </div>
      )}
      {!focus && workspace.data?.application && (
        <Delivery app={workspace.data.application} stale={workspace.isError} />
      )}
      {!focus && !!workspace.data?.tasks.length && (
        <div className="space-y-2">
          {workspace.data.tasks.map((task) => (
            <a
              className="block text-sm underline"
              href={'/c/' + encodeURIComponent(task.conversation_id)}
              key={task.id}
            >
              {task.title}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
