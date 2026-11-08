import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Folder, FolderPlus } from 'lucide-react';
import { Button, Input, Label } from '@librechat/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  personalFileRequest,
  projectRootPath,
  QueryKeys,
  workspaceProjects,
} from 'librechat-data-provider';
import type { PersonalSpace, WorkspaceEntry } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

export default function Root({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (path: string) => void;
  disabled: boolean;
}) {
  const t = useLocalize();
  const { token, user } = useAuthContext();
  const cache = useQueryClient();
  const pickerAtom = useMemo(() => atom({ open: false, name: '' }), []);
  const [picker, setPicker] = useAtom(pickerAtom);
  const space = useQuery<PersonalSpace>({
    queryKey: [QueryKeys.codechatSpace, user?.id],
    queryFn: async () => (await personalFileRequest(token!, 'ensure', 'POST')).json(),
    enabled: picker.open && !!token,
    refetchInterval: (data) => (picker.open && data?.status !== 'ready' ? 5000 : false),
    retry: false,
  });
  const ready = space.data?.status === 'ready';
  const files = useQuery<{ entries: WorkspaceEntry[] }>({
    queryKey: [QueryKeys.codechatFiles, user?.id, ''],
    queryFn: async () => (await personalFileRequest(token!, 'directories', 'GET', '')).json(),
    enabled: picker.open && !!token && ready,
    retry: false,
  });
  const projects = useQuery({
    queryKey: [QueryKeys.workspaceProjects, user?.id],
    queryFn: () => workspaceProjects(token!),
    enabled: picker.open && !!token && ready,
    retry: false,
  });
  const create = useMutation({
    mutationFn: async (name: string) => {
      await personalFileRequest(token!, 'directories', 'POST', name);
      return name;
    },
    onSuccess: (name) => {
      void cache.invalidateQueries([QueryKeys.codechatFiles, user?.id, '']);
      onChange(name);
      setPicker({ open: false, name: '' });
    },
    retry: false,
  });
  const unavailable =
    space.isError || files.isError || projects.isError || space.data?.status === 'requires_review';
  const loaded = files.isSuccess && projects.isSuccess;
  const used = new Set(projects.data?.projects.map((p) => p.path));
  const available = files.data?.entries.filter(
    (entry) =>
      entry.kind === 'directory' &&
      projectRootPath.safeParse(entry.name).success &&
      !used.has(entry.name),
  );
  const duplicate = files.data?.entries.some((entry) => entry.name === picker.name);
  const validName = projectRootPath.safeParse(picker.name).success;
  let error:
    | 'com_project_folder_exists'
    | 'com_project_folder_invalid'
    | 'com_codechat_folder_error'
    | undefined;
  if (duplicate) error = 'com_project_folder_exists';
  else if (picker.name && !validName) error = 'com_project_folder_invalid';
  else if (create.isError) error = 'com_codechat_folder_error';

  return (
    <div className="space-y-2">
      <Label id={id}>{t('com_project_folder')}</Label>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        aria-labelledby={id}
        aria-expanded={picker.open}
        aria-controls={id + '-picker'}
        disabled={disabled || create.isLoading}
        onClick={() => setPicker((prev) => ({ ...prev, open: !prev.open }))}
      >
        <Folder className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{value || t('com_project_folder_choose')}</span>
      </Button>
      {picker.open && (
        <div id={id + '-picker'} className="border-border-light space-y-2 rounded-lg border p-2">
          {unavailable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!ready) void space.refetch();
                else {
                  void files.refetch();
                  void projects.refetch();
                }
              }}
            >
              {t('com_ui_retry')}
            </Button>
          )}
          {!unavailable && !loaded && (
            <p role="status" className="text-text-secondary text-xs">
              {t('com_ui_loading')}
            </p>
          )}
          {!unavailable && loaded && (
            <>
              <ul className="max-h-36 overflow-y-auto">
                {available?.map((entry) => (
                  <li key={entry.name}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      aria-pressed={value === entry.name}
                      disabled={disabled || create.isLoading}
                      onClick={() => {
                        onChange(entry.name);
                        setPicker({ open: false, name: '' });
                      }}
                    >
                      <Folder className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{entry.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={t('com_codechat_folder_name')}
                  placeholder={t('com_codechat_folder_name')}
                  autoComplete="off"
                  autoCapitalize="none"
                  maxLength={80}
                  value={picker.name}
                  disabled={disabled || create.isLoading}
                  onChange={(e) => setPicker({ open: true, name: e.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled || create.isLoading || duplicate || !validName}
                  onClick={() => create.mutate(picker.name)}
                >
                  <FolderPlus className="size-4" aria-hidden="true" />
                  {t('com_codechat_folder_create')}
                </Button>
              </div>
              {error && (
                <p role="alert" className="text-text-secondary text-xs">
                  {t(error)}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
