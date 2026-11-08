import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { atom, useAtom } from 'jotai';
import { Bot, Check, PanelsTopLeft } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  Label,
  OGDialog,
  OGDialogTemplate,
  Spinner,
  Textarea,
  useToastContext,
} from '@librechat/client';
import {
  AIProjectError,
  ProjectRequestError,
  QueryKeys,
  createAIProject,
  saveWorkspaceProject,
  MAX_CHAT_PROJECT_NAME_LENGTH,
  MAX_WORKSPACE_PROJECT_NAME_LENGTH,
  MAX_CHAT_PROJECT_DESCRIPTION_LENGTH,
  personalFileRequest,
  projectRootPath,
} from 'librechat-data-provider';
import type { PersonalSpace } from 'librechat-data-provider';
import { useCreateProjectMutation, useGetStartupConfig } from '~/data-provider';
import { isCodeChatEnabled } from '~/components/CodeChat/config';
import { useAuthContext, useLocalize } from '~/hooks';

type Kind = 'assistant' | 'code';
type Target = { kind?: Kind; path: string };

type ProjectCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (projectId: string, kind?: Kind) => void;
  children?: ReactNode;
  triggerRef?: MutableRefObject<HTMLButtonElement | null>;
};

export default function ProjectCreateDialog({
  open,
  onOpenChange,
  onCreated,
  children,
  triggerRef,
}: ProjectCreateDialogProps) {
  const localize = useLocalize();
  const { user, token } = useAuthContext();
  const cache = useQueryClient();
  const withRoot = isCodeChatEnabled();
  const formId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const targetAtom = useMemo(() => atom<Target>({ path: '' }), []);
  const [target, setTarget] = useAtom(targetAtom);
  const request = useRef<{ key: string; id: string } | undefined>(undefined);
  const submitting = useRef(false);
  const createProject = useCreateProjectMutation();
  const space = useQuery<PersonalSpace>({
    queryKey: [QueryKeys.codechatSpace, user?.id],
    queryFn: async () => (await personalFileRequest(token!, 'ensure', 'POST')).json(),
    enabled: open && withRoot && !!token,
    refetchInterval: (data) => (open && withRoot && data?.status !== 'ready' ? 5000 : false),
    retry: false,
  });
  const ready = space.data?.status === 'ready';
  const validPath = projectRootPath.safeParse(target.path).success;
  const createRootProject = useMutation({
    mutationFn: async ({ kind, path, name }: Required<Target> & { name: string }) => {
      if (!token) throw new Error('missing session');
      const key = JSON.stringify([kind, path, name]);
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
      const request_id = request.current.id;
      const result =
        kind === 'assistant'
          ? await createAIProject(token, {
              path,
              name,
              purpose: name,
              request_id,
            })
          : await saveWorkspaceProject(token, {
              path,
              name,
              goal: '',
              revision: 0,
              request_id,
            });
      if (!result.native_project_id) throw new Error('missing project link');
      return result.native_project_id;
    },
    onSuccess: (id) => {
      void cache.invalidateQueries({ queryKey: [QueryKeys.project, id], refetchType: 'all' });
      void cache.invalidateQueries([QueryKeys.projects]);
      void cache.invalidateQueries([QueryKeys.workspaceProjects, user?.id]);
      void cache.invalidateQueries([QueryKeys.aiProjects, user?.id]);
      void cache.invalidateQueries([QueryKeys.codechatFiles, user?.id, '']);
    },
    retry: false,
  });
  const busy = createProject.isLoading || createRootProject.isLoading;
  const { data: startupConfig } = useGetStartupConfig();
  const descriptionLimit =
    startupConfig?.projects?.maxDescriptionLength ?? MAX_CHAT_PROJECT_DESCRIPTION_LENGTH;
  const { showToast } = useToastContext();

  useEffect(() => {
    if (!open || withRoot) {
      return;
    }
    const frameId = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frameId);
  }, [open, withRoot]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setTarget({ path: '' });
    createRootProject.reset();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && submitting.current) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (
      !trimmedName ||
      submitting.current ||
      (withRoot && (!target.kind || !validPath || !ready))
    ) {
      return;
    }

    submitting.current = true;
    try {
      const kind = withRoot ? target.kind : undefined;
      const id = kind
        ? await createRootProject.mutateAsync({ ...target, kind, name: trimmedName })
        : (
            await createProject.mutateAsync({
              name: trimmedName,
              ...(description.trim() ? { description: description.trim() } : {}),
            })
          )._id;
      request.current = undefined;
      resetForm();
      onOpenChange(false);
      onCreated?.(id, kind);
    } catch (error) {
      const code =
        error instanceof ProjectRequestError || error instanceof AIProjectError ? error.code : '';
      const messages = {
        projects_root_in_use: 'com_project_folder_in_use',
        ai_projects_root_in_use: 'com_project_folder_in_use',
        projects_root_exists: 'com_project_folder_exists',
        ai_projects_root_exists: 'com_project_folder_exists',
        projects_directory_unavailable: 'com_codechat_files_error',
        ai_projects_directory_unavailable: 'com_codechat_files_error',
      } as const;
      const message = Object.hasOwn(messages, code)
        ? messages[code as keyof typeof messages]
        : 'com_ui_project_create_error';
      showToast({ message: localize(message), status: 'error' });
    } finally {
      submitting.current = false;
    }
  };

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange} triggerRef={triggerRef}>
      {children}
      <OGDialogTemplate
        title={localize('com_ui_create_project')}
        showCloseButton={false}
        className="max-h-[90dvh] w-11/12 max-w-md overflow-y-auto"
        main={
          <form id={formId} onSubmit={handleCreate} className="flex flex-col gap-4">
            {withRoot && (
              <fieldset disabled={busy} className="grid grid-cols-2 gap-2">
                <legend className="sr-only">{localize('com_project_kind')}</legend>
                {(
                  [
                    { kind: 'assistant', icon: Bot, label: 'com_project_kind_assistant' },
                    { kind: 'code', icon: PanelsTopLeft, label: 'com_project_kind_app' },
                  ] as const
                ).map(({ kind, icon: Icon, label }) => (
                  <label
                    key={kind}
                    className="border-border-light has-checked:border-border-heavy has-checked:bg-surface-secondary relative flex min-h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border p-2 has-focus-visible:ring-2"
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name={formId + '-kind'}
                      checked={target.kind === kind}
                      onChange={() => setTarget((prev) => ({ ...prev, kind }))}
                    />
                    <Icon aria-hidden="true" className="size-5" />
                    {localize(label)}
                    {target.kind === kind && (
                      <Check aria-hidden="true" className="absolute end-2 top-2 size-4" />
                    )}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="space-y-2">
              <Label htmlFor={`${formId}-name`} className="text-sm font-medium">
                {localize('com_ui_project_name')}
              </Label>
              <Input
                id={`${formId}-name`}
                ref={inputRef}
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                placeholder={withRoot ? undefined : localize('com_ui_project_name_placeholder')}
                maxLength={
                  withRoot ? MAX_WORKSPACE_PROJECT_NAME_LENGTH : MAX_CHAT_PROJECT_NAME_LENGTH
                }
                className="w-full"
              />
            </div>
            {withRoot ? (
              <div className="space-y-2">
                <Label htmlFor={formId + '-root'}>{localize('com_project_folder_new')}</Label>
                <Input
                  id={formId + '-root'}
                  autoComplete="off"
                  autoCapitalize="none"
                  maxLength={80}
                  value={target.path}
                  onChange={(event) => setTarget((prev) => ({ ...prev, path: event.target.value }))}
                  aria-describedby={formId + '-root-rules'}
                  aria-invalid={!!target.path && !validPath}
                  disabled={busy}
                />
                <p id={formId + '-root-rules'} className="text-text-secondary text-xs">
                  {localize('com_project_folder_invalid')}
                </p>
                {!ready && (
                  <p role="status" className="text-text-secondary text-xs">
                    {localize(
                      space.isError || space.data?.status === 'requires_review'
                        ? 'com_codechat_files_error'
                        : 'com_ui_loading',
                    )}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor={`${formId}-description`} className="text-sm font-medium">
                  {localize('com_ui_description')}{' '}
                  <span className="text-text-secondary font-normal">
                    {localize('com_ui_optional')}
                  </span>
                </Label>
                <Textarea
                  id={`${formId}-description`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  maxLength={descriptionLimit}
                  className="min-h-[4.5rem]"
                />
              </div>
            )}
          </form>
        }
        buttons={
          <Button
            type="submit"
            form={formId}
            variant="submit"
            disabled={!name.trim() || busy || (withRoot && (!target.kind || !validPath || !ready))}
            aria-label={localize('com_ui_create_project')}
            className="active:scale-[0.96]"
          >
            {busy ? (
              <Spinner className="size-4" />
            ) : (
              localize(withRoot ? 'com_project_create' : 'com_ui_create_project')
            )}
          </Button>
        }
      />
    </OGDialog>
  );
}
