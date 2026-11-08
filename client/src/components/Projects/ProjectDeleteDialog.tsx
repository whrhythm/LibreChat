import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AIProjectError,
  QueryKeys,
  advanceAIProjectDeletion,
  inspectAIProjectDeletion,
} from 'librechat-data-provider';
import {
  Button,
  Spinner,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  useToastContext,
} from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import type { ComponentProps } from 'react';
import { useInvalidateDeletedProject } from '~/data-provider/Projects/mutations';
import { useDeleteProjectMutation } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { projectInspector } from './navigation';

type ProjectDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TChatProject;
  triggerRef?: ComponentProps<typeof OGDialog>['triggerRef'];
};

export default function ProjectDeleteDialog({
  open,
  onOpenChange,
  project,
  triggerRef,
}: ProjectDeleteDialogProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const deleteProject = useDeleteProjectMutation();
  const { showToast } = useToastContext();
  const { user, token } = useAuthContext();
  const [inspector, setInspector] = useAtom(projectInspector(user?.id ?? 'anonymous'));
  const queryClient = useQueryClient();
  const invalidateDeleted = useInvalidateDeletedProject();
  const linked = !!project.platformProjectId;
  const queryKey = ['assistant-project-deletion', user?.id, project._id];
  const inspection = useQuery({
    queryKey,
    queryFn: () => inspectAIProjectDeletion(token!, project._id),
    enabled: open && linked && !!token,
    cacheTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
  });
  const advance = useMutation(
    (confirmation?: { digest: string; removeFolder: boolean }) =>
      advanceAIProjectDeletion(
        token!,
        project._id,
        confirmation?.digest,
        confirmation?.removeFolder,
      ),
    {
      onSuccess: (status) => {
        queryClient.setQueryData(queryKey, status);
        queryClient.invalidateQueries([QueryKeys.assistantCatalog]);
        queryClient.invalidateQueries([QueryKeys.knowledgeLibraries]);
        if (status.state !== 'deleted') return;
        if (inspector?.projectId === project._id) setInspector(null);
        onOpenChange(false);
        invalidateDeleted(project._id);
        queryClient.invalidateQueries([QueryKeys.aiProjects]);
        queryClient.invalidateQueries([QueryKeys.workspaceProjects]);
        queryClient.invalidateQueries([QueryKeys.codechatFiles]);
        if (location.pathname === '/projects/' + project._id) navigate('/projects');
        if (
          location.pathname === '/c/new' &&
          new URLSearchParams(location.search).get('projectId') === project._id
        )
          navigate('/c/new', { replace: true });
        showToast({
          message: localize(
            status.folder_retained
              ? 'com_project_deletion_done_kept_folder'
              : 'com_project_deletion_done',
          ),
        });
      },
      onError: (error) => {
        if (error instanceof AIProjectError && error.code === 'ai_projects_deletion_changed')
          void inspection.refetch();
      },
    },
  );
  const state = inspection.data;
  const pending = state && state.state !== 'confirm';
  const advanceDeletion = advance.mutate;
  useEffect(() => {
    if (!open || !pending || advance.isLoading || advance.isError || !token) return;
    const timer = setTimeout(
      () => advanceDeletion(undefined),
      state.state === 'knowledge' ? 2500 : 0,
    );
    return () => clearTimeout(timer);
  }, [open, pending, state, advance.isLoading, advance.isError, advanceDeletion, token]);

  const inspectionError = inspection.error;
  const unavailable =
    inspectionError instanceof AIProjectError && inspectionError.code === 'ai_projects_not_found';
  const notReady =
    inspectionError instanceof AIProjectError &&
    inspectionError.code === 'ai_projects_deletion_not_ready';
  let inspectionMessage: Parameters<typeof localize>[0] = 'com_project_deletion_load_error';
  if (unavailable) inspectionMessage = 'com_project_delete_linked';
  if (notReady) inspectionMessage = 'com_project_deletion_not_ready';
  const changed =
    advance.error instanceof AIProjectError &&
    advance.error.code === 'ai_projects_deletion_changed';

  const confirmDelete = () => {
    deleteProject.mutate(project._id, {
      onSuccess: () => {
        onOpenChange(false);
        if (location.pathname === `/projects/${project._id}`) {
          navigate('/projects');
        }
      },
      onError: () =>
        showToast({
          message: localize('com_ui_project_delete_error'),
          severity: NotificationSeverity.ERROR,
          showIcon: true,
        }),
    });
  };

  return (
    <OGDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) advance.reset();
        onOpenChange(next);
      }}
      triggerRef={triggerRef}
    >
      <OGDialogContent className="w-11/12 max-w-md" showCloseButton={false}>
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_delete_project')}</OGDialogTitle>
        </OGDialogHeader>
        <div className="text-text-secondary space-y-3 text-sm" aria-live="polite">
          {!linked &&
            (project.platformLinkIntent
              ? localize('com_project_delete_linked')
              : localize('com_ui_delete_project_confirm', { name: project.name }))}
          {linked && inspection.isFetching && !state && <Spinner className="size-4" />}
          {linked && inspection.isError && <p>{localize(inspectionMessage)}</p>}
          {linked && state?.state === 'confirm' && !inspection.isError && (
            <>
              <p className="text-text-primary font-medium">{project.name}</p>
              <div>
                <p className="text-text-primary font-medium">
                  {localize('com_project_deletion_remove')}
                </p>
                <ul className="list-disc ps-5">
                  <li>
                    {localize('com_project_deletion_versions', {
                      trials: state.trials,
                      releases: state.releases,
                      shares: state.shares,
                    })}
                  </li>
                  <li>
                    {localize('com_project_deletion_indexes', {
                      libraries: state.knowledge_libraries,
                      revisions: state.knowledge_revisions,
                    })}
                  </li>
                  {state.folder_cleanup && (
                    <li>
                      {localize('com_project_deletion_remove_folder', {
                        folder: state.folder,
                        files: state.folder_cleanup.files,
                        directories: state.folder_cleanup.directories,
                      })}
                    </li>
                  )}
                </ul>
              </div>
              <div>
                <p className="text-text-primary font-medium">
                  {localize('com_project_deletion_keep')}
                </p>
                <ul className="list-disc ps-5">
                  <li>
                    {localize('com_project_deletion_keep_libraries', {
                      count: state.preserved_libraries,
                    })}
                  </li>
                  {!state.folder_cleanup && (
                    <li>
                      {localize(
                        state.folder_retention_reason === 'in_use'
                          ? 'com_project_deletion_keep_active_folder'
                          : 'com_project_deletion_keep_files',
                        { folder: state.folder },
                      )}
                    </li>
                  )}
                  <li>{localize('com_project_deletion_keep_history')}</li>
                </ul>
              </div>
            </>
          )}
          {state?.state === 'knowledge' && (
            <p>
              {localize(
                state.retrying
                  ? 'com_project_deletion_knowledge_retry'
                  : 'com_project_deletion_knowledge',
                { remaining: state.remaining },
              )}
            </p>
          )}
          {state && (state.state === 'native' || state.state === 'deleted') && (
            <p>{localize('com_project_deletion_finishing')}</p>
          )}
          {advance.isError && (
            <p role="alert">
              {localize(
                changed ? 'com_project_deletion_changed' : 'com_project_deletion_interrupted',
              )}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-4 pt-4">
          <OGDialogClose asChild>
            <Button aria-label={localize('com_ui_cancel')} variant="outline">
              {localize(pending ? 'com_ui_close' : 'com_ui_cancel')}
            </Button>
          </OGDialogClose>
          {!linked && (
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={
                deleteProject.isLoading ||
                !!project.platformProjectId ||
                !!project.platformLinkIntent
              }
            >
              {deleteProject.isLoading ? <Spinner className="size-4" /> : localize('com_ui_delete')}
            </Button>
          )}
          {linked && inspection.isError && !unavailable && !notReady && (
            <Button variant="outline" onClick={() => void inspection.refetch()}>
              {localize('com_ui_retry')}
            </Button>
          )}
          {linked && state?.state === 'confirm' && !inspection.isError && (
            <Button
              variant="destructive"
              disabled={advance.isLoading || inspection.isFetching}
              onClick={() =>
                advanceDeletion({
                  digest: state.confirmation,
                  removeFolder: !!state.folder_cleanup,
                })
              }
            >
              {advance.isLoading ? <Spinner className="size-4" /> : localize('com_ui_delete')}
            </Button>
          )}
          {linked && pending && advance.isError && (
            <Button onClick={() => advanceDeletion(undefined)}>{localize('com_ui_retry')}</Button>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
