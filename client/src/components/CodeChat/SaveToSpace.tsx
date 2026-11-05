import { useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { FolderDown } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dataService,
  personalFileRequest,
  PersonalFileError,
  QueryKeys,
} from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import type { TAttachment, WorkspaceEntry } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { useShareContext } from '~/Providers';

/** Reuses authenticated downloads and the personal-volume atomic, no-overwrite upload. */
type GeneratedFile = Partial<TAttachment> & { user?: string; file_id?: string };

export default function SaveToSpace({ files }: { files: GeneratedFile[] }) {
  return files.some((file) => file?.filepath && file.filename) ? (
    <SaveGeneratedFiles files={files.filter(Boolean)} />
  ) : null;
}

function SaveGeneratedFiles({ files }: { files: GeneratedFile[] }) {
  const { user, token } = useAuthContext();
  const { shareId } = useShareContext();
  const t = useLocalize();
  const client = useQueryClient();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useAtom(useMemo(() => atom(false), []));
  const [selected, setSelected] = useAtom(useMemo(() => atom(0), []));
  const [path, setPath] = useAtom(useMemo(() => atom(''), []));
  const [name, setName] = useAtom(useMemo(() => atom(''), []));
  const eligible = files.filter(
    (file) => file.filename && file.filepath && (!file.user || file.user === user?.id),
  );
  const folders = useQuery({
    queryKey: [QueryKeys.codechatFiles, user?.id, path, 'save-picker'],
    queryFn: async (): Promise<{ entries: WorkspaceEntry[] }> =>
      (await personalFileRequest(token!, 'directories', 'GET', path)).json(),
    enabled: open && !!token,
    retry: false,
  });
  const save = useMutation({
    mutationKey: [QueryKeys.codechatFiles, user?.id, 'save-generated'],
    mutationFn: async () => {
      const file = eligible[selected];
      if (
        !file ||
        !name.trim() ||
        /[\\/]/.test(name) ||
        [...name].some((character) => character.charCodeAt(0) < 32) ||
        name === '.' ||
        name === '..'
      )
        throw new Error('invalid_name');
      const target = path ? `${path}/${name}` : name;
      const href = file.filepath ?? '';
      const remoteCodeOutput =
        href.startsWith('/api/files/code/') || href.startsWith('/api/files/code?');
      // Never fetch an arbitrary artifact URL with the user's authorization headers.
      let response: { data: unknown } | null = null;
      if (remoteCodeOutput) response = await dataService.getCodeOutputDownload(href);
      else if (file.file_id && user?.id)
        response = await dataService.getFileDownload(user.id, file.file_id);
      const blob = response?.data;
      if (!(blob instanceof Blob) || blob.size > 16 * 1024 * 1024)
        throw new Error('download_unavailable');
      await personalFileRequest(token!, 'file', 'PUT', target, blob);
    },
    onSuccess: async () => {
      await Promise.all(
        [QueryKeys.codechatFiles, QueryKeys.codechatUsage, QueryKeys.codechatCapacity].map((key) =>
          client.invalidateQueries([key, user?.id]),
        ),
      );
    },
    retry: false,
  });
  if (!user || !token || shareId || eligible.length === 0) return null;
  let errorKey:
    | 'com_codechat_save_generated_error'
    | 'com_codechat_save_generated_conflict'
    | 'com_codechat_save_generated_full' = 'com_codechat_save_generated_error';
  if (save.error instanceof PersonalFileError)
    errorKey =
      save.error.code === 'conflict'
        ? 'com_codechat_save_generated_conflict'
        : 'com_codechat_save_generated_full';
  return (
    <>
      <Button
        ref={trigger}
        size="xs"
        variant="outline"
        onClick={() => {
          save.reset();
          setSelected(0);
          setName(eligible[0].filename ?? '');
          setOpen(true);
        }}
      >
        <FolderDown className="size-4" aria-hidden="true" />
        {t('com_codechat_save_generated')}
      </Button>
      <OGDialog
        open={open}
        triggerRef={trigger}
        onOpenChange={(value) => {
          if (!save.isLoading) setOpen(value);
        }}
      >
        <OGDialogContent placement="center" className="sm:max-w-lg">
          <OGDialogTitle>{t('com_codechat_save_generated')}</OGDialogTitle>
          <OGDialogDescription>{t('com_codechat_save_generated_help')}</OGDialogDescription>
          <label className="flex flex-col gap-2 text-sm">
            {t('com_codechat_save_generated_file')}
            <select
              className="border-border-light bg-surface-primary rounded border p-2"
              value={selected}
              disabled={save.isLoading}
              onChange={(event) => {
                const index = Number(event.target.value);
                setSelected(index);
                setName(eligible[index].filename ?? '');
                save.reset();
              }}
            >
              {eligible.map((file, index) => (
                <option key={file.file_id ?? index} value={index}>
                  {file.filename}
                </option>
              ))}
            </select>
          </label>
          <div className="border-border-light rounded border p-3 text-sm">
            <p className="mb-2 break-all">
              {t('com_codechat_save_generated_folder', { path: '/' + path })}
            </p>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">
              {path && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={save.isLoading}
                  onClick={() => {
                    setPath(path.split('/').slice(0, -1).join('/'));
                    save.reset();
                  }}
                >
                  ..
                </Button>
              )}
              {folders.data?.entries
                .filter((entry) => entry.kind === 'directory')
                .map((entry) => (
                  <Button
                    key={entry.name}
                    size="xs"
                    variant="outline"
                    disabled={save.isLoading}
                    onClick={() => {
                      setPath(path ? `${path}/${entry.name}` : entry.name);
                      save.reset();
                    }}
                  >
                    {entry.name}
                  </Button>
                ))}
            </div>
            {folders.isLoading && <p>{t('com_ui_loading')}</p>}
            {folders.isError && <p role="alert">{t('com_codechat_files_error')}</p>}
          </div>
          <label className="flex flex-col gap-2 text-sm">
            {t('com_codechat_save_generated_name')}
            <input
              className="border-border-light bg-surface-primary rounded border p-2"
              value={name}
              maxLength={240}
              disabled={save.isLoading}
              onChange={(event) => {
                setName(event.target.value);
                save.reset();
              }}
            />
          </label>
          {save.isError && (
            <p role="alert" className="text-text-destructive text-sm">
              {t(errorKey)}
            </p>
          )}
          {save.isSuccess && (
            <p role="status" className="text-sm">
              {t('com_codechat_save_generated_done')}
            </p>
          )}
          <Button
            disabled={
              save.isLoading ||
              save.isSuccess ||
              !name.trim() ||
              folders.isError ||
              folders.isLoading
            }
            onClick={() => save.mutate()}
          >
            {t(save.isLoading ? 'com_ui_loading' : 'com_ui_save')}
          </Button>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
