import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Folder, PanelsTopLeft } from 'lucide-react';
import { aiProjects, QueryKeys, workspaceProjects } from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
} from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import type { ComponentProps } from 'react';
import { useUpdateProjectMutation } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import ProjectEditor from './ProjectEditor';

type ProjectEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TChatProject;
  triggerRef?: ComponentProps<typeof OGDialog>['triggerRef'];
};

function ProjectBinding({ project }: { project: TChatProject }) {
  const t = useLocalize();
  const { token, user } = useAuthContext();
  const linkedId = project.platformProjectId;
  const enabled = !!token && !!linkedId;
  const assistants = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id],
    queryFn: () => aiProjects(token!),
    enabled,
    retry: false,
  });
  const workspace = useQuery({
    queryKey: [QueryKeys.workspaceProjects, user?.id],
    queryFn: () => workspaceProjects(token!),
    enabled,
    retry: false,
  });
  const assistant = assistants.data?.projects.find(({ project }) => project.id === linkedId);
  const record = workspace.data?.projects.find(({ id }) => id === linkedId);
  const pending = project.platformLinkIntent;
  const path = record?.path ?? assistant?.project.path ?? pending?.path;
  const kind = assistant ? 'assistant' : pending?.kind;
  const isCode = kind === 'code' || (!kind && !!record && assistants.data?.enabled === true);
  const kindLabel =
    kind === 'assistant' ? t('com_project_kind_assistant') : t('com_project_kind_app');
  const Icon = isCode ? PanelsTopLeft : Bot;
  const loading = enabled && (assistants.isLoading || workspace.isLoading);
  const error = assistants.isError || workspace.isError;
  const fallback = t(loading ? 'com_ui_loading' : 'com_project_binding_unavailable');

  return (
    <section
      aria-label={t('com_project_binding')}
      className="border-border-light space-y-2 rounded-lg border p-3 text-sm"
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <dt className="text-text-secondary">{t('com_project_kind')}</dt>
        <dd className="flex min-w-0 items-center gap-2">
          {kind || isCode ? (
            <>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {kindLabel}
            </>
          ) : (
            fallback
          )}
        </dd>
        <dt className="text-text-secondary">{t('com_project_folder')}</dt>
        <dd className="flex min-w-0 items-start gap-2">
          <Folder className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {path ? <code className="min-w-0 wrap-anywhere">{path}</code> : fallback}
        </dd>
      </dl>
      <p className="text-text-secondary text-xs">{t('com_project_binding_locked')}</p>
      {error && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (assistants.isError) void assistants.refetch();
            if (workspace.isError) void workspace.refetch();
          }}
        >
          {t('com_ui_retry')}
        </Button>
      )}
    </section>
  );
}

export default function ProjectEditDialog({
  open,
  onOpenChange,
  project,
  triggerRef,
}: ProjectEditDialogProps) {
  const localize = useLocalize();
  /** Owned here, so a save in flight settles with its toast; the dialog stays open meanwhile. */
  const updateProject = useUpdateProjectMutation();
  const savingRef = useRef(false);
  /** Read at event time: the submit marks the ref before the loading state renders. */
  const isBusy = () => savingRef.current || updateProject.isLoading;
  return (
    <OGDialog
      open={open}
      onOpenChange={(next) => {
        if (next || !isBusy()) {
          onOpenChange(next);
        }
      }}
      triggerRef={triggerRef}
    >
      <OGDialogContent
        className="max-h-[90dvh] w-11/12 max-w-md overflow-y-auto"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (isBusy()) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (isBusy()) {
            event.preventDefault();
          }
        }}
      >
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_edit_project')}</OGDialogTitle>
        </OGDialogHeader>
        {open && (project.platformProjectId || project.platformLinkIntent) && (
          <ProjectBinding project={project} />
        )}
        {/* Mounted per opening so the form starts from the saved project. */}
        {open ? (
          <ProjectEditor
            project={project}
            layout="dialog"
            updateProject={updateProject}
            savingRef={savingRef}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </OGDialogContent>
    </OGDialog>
  );
}
