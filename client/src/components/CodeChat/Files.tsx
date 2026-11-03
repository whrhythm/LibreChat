import { useRef, useState } from 'react';
import { Button } from '@librechat/client';
import { personalFileRequest, QueryKeys } from 'librechat-data-provider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, File, Folder, Pencil, Trash2, Upload } from 'lucide-react';
import type { PersonalSpace, PersonalUsage, WorkspaceEntry } from 'librechat-data-provider';
import type { FileAction } from './FileDialog';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { storageSize } from './storage';
import FileDialog from './FileDialog';

export default function PersonalFiles({
  expanded,
  path: selectedPath,
  onPathChange,
}: {
  expanded: boolean;
  path?: string;
  onPathChange?: (path: string) => void;
}) {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const client = useQueryClient();
  const [localPath, setLocalPath] = useState('');
  const path = selectedPath ?? localPath;
  const setPath = onPathChange ?? setLocalPath;
  const input = useRef<HTMLInputElement>(null);
  const [downloadError, setDownloadError] = useState(false);
  const [action, setAction] = useState<FileAction | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const { data: startup } = useGetStartupConfig();
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
    refetchInterval: expanded ? 5000 : false,
    retry: false,
  });
  const usage = useQuery<PersonalUsage>({
    queryKey: [QueryKeys.codechatUsage, owner],
    queryFn: async () => (await personalFileRequest(token!, 'usage')).json(),
    enabled: expanded && !!token && space.data?.status === 'ready',
    refetchInterval: expanded ? 30000 : false,
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
    onSuccess: async () => {
      await client.invalidateQueries([QueryKeys.codechatFiles, owner]);
      await client.invalidateQueries([QueryKeys.codechatUsage, owner]);
    },
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
  if (space.isError)
    return (
      <div role="alert" className="py-2">
        <p>{localize('com_codechat_files_error')}</p>
        <Button variant="ghost" onClick={() => void space.refetch()}>
          {localize('com_codechat_retry')}
        </Button>
      </div>
    );
  if (space.data?.status !== 'ready')
    return (
      <p role="status" className="py-2">
        {localize(
          space.data?.status === 'requires_review'
            ? 'com_codechat_files_error'
            : 'com_codechat_files_preparing',
        )}
      </p>
    );
  return (
    <div className="flex flex-col gap-2 py-2">
      <p className="text-xs">
        {localize('com_codechat_files_capacity', { capacity: space.data.storage_gib })}
      </p>
      {usage.data && (
        <div className="text-xs" aria-label={localize('com_codechat_usage_label')}>
          <p>
            {localize('com_codechat_usage_values', {
              used: storageSize(usage.data.used_bytes),
              capacity: storageSize(usage.data.quota_bytes),
              percent:
                usage.data.used_bytes > 0 && usage.data.used_bytes / usage.data.quota_bytes < 0.001
                  ? '<0.1'
                  : ((usage.data.used_bytes / usage.data.quota_bytes) * 100).toFixed(1),
            })}
          </p>
          <progress
            className="w-full"
            aria-label={localize('com_codechat_usage_label')}
            max={usage.data.quota_bytes}
            value={Math.min(usage.data.used_bytes, usage.data.quota_bytes)}
          />
          <p>{localize('com_codechat_usage_scope')}</p>
          <time dateTime={usage.data.observed_at}>
            {localize('com_codechat_usage_observed', {
              time: new Date(usage.data.observed_at).toLocaleTimeString(),
            })}
          </time>
          {(usage.data.used_bytes >= usage.data.quota_bytes * 0.9 ||
            usage.data.physical_available_bytes < 16 * 1024 * 1024) && (
            <p role="alert">{localize('com_codechat_usage_warning')}</p>
          )}
        </div>
      )}
      {usage.isError && <p role="status">{localize('com_codechat_usage_unavailable')}</p>}
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
      <Button variant="ghost" disabled={upload.isLoading} onClick={() => input.current?.click()}>
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
      {files.isLoading && <p role="status">{localize('com_codechat_files_loading')}</p>}
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
          <li key={entry.name} className="flex items-center gap-1">
            <button
              type="button"
              className="hover:bg-surface-hover flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left"
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                entry.kind === 'directory'
                  ? setPath(path ? `${path}/${entry.name}` : entry.name)
                  : setAction({
                      entry,
                      path: path ? `${path}/${entry.name}` : entry.name,
                      mode: 'preview',
                    });
              }}
            >
              {entry.kind === 'directory' ? (
                <Folder aria-hidden="true" className="h-4 w-4 shrink-0" />
              ) : (
                <File aria-hidden="true" className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
            {entry.kind === 'file' && (
              <div className="flex shrink-0">
                {(['preview', 'download', 'edit', 'delete'] as const).map((mode) => {
                  const Icon = {
                    preview: Eye,
                    download: Download,
                    edit: Pencil,
                    delete: Trash2,
                  }[mode];
                  const label = localize(
                    (
                      {
                        preview: 'com_codechat_file_preview',
                        download: 'com_codechat_file_download',
                        edit: 'com_codechat_file_edit',
                        delete: 'com_codechat_file_delete',
                      } as const
                    )[mode],
                    { name: entry.name },
                  );
                  return (
                    <Button
                      key={mode}
                      variant="ghost"
                      size="icon-sm"
                      aria-label={label}
                      title={label}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        if (mode === 'download') void download(entry);
                        else
                          setAction({
                            entry,
                            path: path ? `${path}/${entry.name}` : entry.name,
                            mode,
                          });
                      }}
                    >
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
      {action && (
        <FileDialog
          key={action.path + action.mode}
          action={action}
          triggerRef={triggerRef}
          maxBytes={startup?.codechat?.filePreviewMaxBytes ?? 1024 * 1024}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}
