import { useRef, useState } from 'react';
import { Button } from '@librechat/client';
import { File, Folder, Upload } from 'lucide-react';
import { personalFileRequest, QueryKeys } from 'librechat-data-provider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PersonalSpace, WorkspaceEntry } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

export default function PersonalFiles({ expanded }: { expanded: boolean }) {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const client = useQueryClient();
  const [path, setPath] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [downloadError, setDownloadError] = useState(false);
  const owner = user?.id;
  const space = useQuery<PersonalSpace>({
    queryKey: [QueryKeys.codechatSpace, owner],
    queryFn: async () => (await personalFileRequest(token!, 'ensure', 'POST')).json(),
    enabled: !!owner && !!token,
    retry: false,
    refetchInterval: (data) => (data?.status === 'ready' ? 30000 : 5000),
  });
  const files = useQuery<{ entries: WorkspaceEntry[] }>({
    queryKey: [QueryKeys.codechatFiles, owner, path],
    queryFn: async () => (await personalFileRequest(token!, 'directories', 'GET', path)).json(),
    enabled: expanded && !!token && space.data?.status === 'ready',
    retry: false,
  });
  const upload = useMutation({
    mutationFn: async (file: globalThis.File) => {
      if (file.size > 16 * 1024 * 1024) throw new Error('file_too_large');
      await personalFileRequest(
        token!,
        'file',
        'PUT',
        path ? `${path}/${file.name}` : file.name,
        file,
      );
    },
    onSuccess: () => client.invalidateQueries([QueryKeys.codechatFiles, owner]),
    retry: false,
  });
  async function download(entry: WorkspaceEntry) {
    setDownloadError(false);
    try {
      const result = await personalFileRequest(
        token!,
        'file',
        'GET',
        path ? `${path}/${entry.name}` : entry.name,
      );
      const url = URL.createObjectURL(await result.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = entry.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(true);
    }
  }
  return (
    <div className="flex flex-col gap-2 py-2">
      {space.isError ? (
        <div role="alert">
          <p>{localize('com_codechat_files_error')}</p>
          <Button variant="ghost" onClick={() => void space.refetch()}>
            {localize('com_codechat_retry')}
          </Button>
        </div>
      ) : space.data?.status !== 'ready' ? (
        <p role="status">
          {localize(
            space.data?.status === 'requires_review'
              ? 'com_codechat_files_error'
              : 'com_codechat_files_preparing',
          )}
        </p>
      ) : (
        <>
          <p className="text-xs">
            {localize('com_codechat_files_capacity', { capacity: space.data.storage_gib })}
          </p>
          <input
            ref={input}
            type="file"
            className="hidden"
            aria-label={localize('com_ui_upload_files')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
              event.target.value = '';
            }}
          />
          <Button
            variant="ghost"
            disabled={upload.isLoading}
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden="true" className="mr-2 h-4 w-4" />
            {localize(upload.isLoading ? 'com_ui_loading' : 'com_ui_upload_files')}
          </Button>
          {upload.isError && <p role="alert">{localize('com_codechat_files_upload_error')}</p>}
          {downloadError && <p role="alert">{localize('com_codechat_files_error')}</p>}
          {path && (
            <Button variant="ghost" onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}>
              ..
            </Button>
          )}
          {files.isFetching && <p role="status">{localize('com_codechat_files_loading')}</p>}
          {files.isError && (
            <div role="alert">
              <p>{localize('com_codechat_files_error')}</p>
              <Button variant="ghost" onClick={() => void files.refetch()}>
                {localize('com_codechat_retry')}
              </Button>
            </div>
          )}
          {files.data?.entries.length === 0 && <p>{localize('com_codechat_files_empty')}</p>}
          <ul className="flex flex-col gap-1">
            {files.data?.entries.map((entry) => (
              <li key={entry.name}>
                <button
                  type="button"
                  className="hover:bg-surface-hover flex w-full items-center gap-2 rounded px-2 py-1 text-left"
                  onClick={() =>
                    entry.kind === 'directory'
                      ? setPath(path ? `${path}/${entry.name}` : entry.name)
                      : void download(entry)
                  }
                >
                  {entry.kind === 'directory' ? (
                    <Folder aria-hidden="true" className="h-4 w-4 shrink-0" />
                  ) : (
                    <File aria-hidden="true" className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
