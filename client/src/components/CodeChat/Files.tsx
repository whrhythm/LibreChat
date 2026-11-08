import { useEffect, useId, useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { MenuButton } from '@ariakit/react';
import { Button, DropdownPopup } from '@librechat/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { personalFileRequest, QueryKeys, workspaceProjects } from 'librechat-data-provider';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Ellipsis,
  File,
  Folder,
  Pencil,
  Upload,
} from 'lucide-react';
import type { PersonalSpace, WorkspaceEntry } from 'librechat-data-provider';
import type { FileAction } from './FileDialog';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import FileDialog from './FileDialog';
import NewFolder from './NewFolder';
import { spaceDirty } from './dock';
import Versions from './Versions';

type TreeActions = {
  projectLabels: ReadonlyMap<string, string>;
  selected: string;
  expanded: ReadonlySet<string>;
  toggle: (path: string, open: boolean) => void;
  open: (action: FileAction, trigger: HTMLElement | null) => void;
  download: (path: string, entry: WorkspaceEntry) => Promise<void>;
};

function EntryMenu({
  entry,
  path,
  actions,
}: {
  entry: WorkspaceEntry;
  path: string;
  actions: TreeActions;
}) {
  const localize = useLocalize();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const openAtom = useMemo(() => atom(false), []);
  const [open, setOpen] = useAtom(openAtom);
  const download = {
    id: 'download',
    label: localize(
      entry.kind === 'directory' ? 'com_codechat_folder_download' : 'com_codechat_file_download',
      { name: entry.name },
    ),
    onClick: () => void actions.download(path, entry),
  };
  const items =
    entry.kind === 'directory'
      ? [download]
      : [
          {
            id: 'preview',
            label: localize('com_codechat_file_preview', { name: entry.name }),
            onClick: () => actions.open({ entry, path, mode: 'preview' }, trigger.current),
          },
          download,
          {
            id: 'edit',
            label: localize('com_codechat_file_edit', { name: entry.name }),
            onClick: () => actions.open({ entry, path, mode: 'edit' }, trigger.current),
          },
          {
            id: 'delete',
            label: localize('com_codechat_file_delete', { name: entry.name }),
            onClick: () => actions.open({ entry, path, mode: 'delete' }, trigger.current),
          },
        ];
  return (
    <DropdownPopup
      portal
      menuId={id}
      isOpen={open}
      setIsOpen={setOpen}
      items={items}
      trigger={
        <MenuButton
          ref={trigger}
          aria-label={localize('com_codechat_file_actions', { name: entry.name })}
          render={<Button variant="ghost" size="icon-sm" className="size-6 shrink-0" />}
        >
          <Ellipsis className="size-3.5" aria-hidden="true" />
        </MenuButton>
      }
    />
  );
}

function Directory({ path, actions }: { path: string; actions: TreeActions }) {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const files = useQuery<{ entries: WorkspaceEntry[] }>({
    queryKey: [QueryKeys.codechatFiles, user?.id, path],
    queryFn: async () => (await personalFileRequest(token!, 'directories', 'GET', path)).json(),
    enabled: !!token && !!user?.id,
    refetchInterval: path ? 10000 : 5000,
    retry: false,
  });
  if (files.isLoading)
    return (
      <p role="status" className="px-2 text-xs">
        {localize('com_codechat_files_loading')}
      </p>
    );
  if (files.isError)
    return (
      <div role="alert" className="px-2 text-xs">
        <p>{localize('com_codechat_files_error')}</p>
        <Button variant="ghost" onClick={() => void files.refetch()}>
          {localize('com_codechat_retry')}
        </Button>
      </div>
    );
  if (!files.data?.entries.length)
    return <p className="px-2 text-xs">{localize('com_codechat_files_empty')}</p>;
  const entries = [...files.data.entries].sort((a, b) => {
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === 'directory' ? -1 : 1;
  });
  return (
    <ul className={path ? 'border-border-light ms-2 border-s ps-1' : ''}>
      {entries.map((entry) => {
        const child = path ? path + '/' + entry.name : entry.name;
        const folder = entry.kind === 'directory';
        const projectLabel = folder ? actions.projectLabels.get(child) : undefined;
        const open = folder && actions.expanded.has(child);
        return (
          <li key={entry.name}>
            <div
              className={`hover:bg-surface-hover flex min-w-0 items-center rounded ${actions.selected === child ? 'bg-surface-active-alt' : ''}`}
            >
              <button
                type="button"
                aria-expanded={folder ? open : undefined}
                title={entry.name}
                className="text-text-primary text-1xs flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded ps-1 text-start"
                onClick={(event) =>
                  folder
                    ? actions.toggle(child, !open)
                    : actions.open({ entry, path: child, mode: 'preview' }, event.currentTarget)
                }
                onKeyDown={(event) => {
                  if (!folder || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
                  event.preventDefault();
                  actions.toggle(child, event.key === 'ArrowRight');
                }}
              >
                {folder ? (
                  <>
                    {open ? (
                      <ChevronDown aria-hidden="true" className="size-3 shrink-0" />
                    ) : (
                      <ChevronRight
                        aria-hidden="true"
                        className="size-3 shrink-0 rtl:-scale-x-100"
                      />
                    )}
                    <Folder aria-hidden="true" className="size-3.5 shrink-0" />
                  </>
                ) : (
                  <File aria-hidden="true" className="ms-4 size-3.5 shrink-0" />
                )}
                <span className="truncate">{entry.name}</span>
                {projectLabel && (
                  <span
                    className="bg-surface-secondary text-text-secondary max-w-[45%] truncate rounded px-1.5 text-xs"
                    title={projectLabel}
                  >
                    {projectLabel}
                  </span>
                )}
              </button>
              {!folder && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0"
                  aria-label={localize('com_codechat_file_edit', { name: entry.name })}
                  title={localize('com_codechat_file_edit', { name: entry.name })}
                  onClick={(event) =>
                    actions.open({ entry, path: child, mode: 'edit' }, event.currentTarget)
                  }
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 shrink-0"
                aria-label={localize(
                  folder ? 'com_codechat_folder_download' : 'com_codechat_file_download',
                  { name: entry.name },
                )}
                onClick={() => void actions.download(child, entry)}
              >
                <Download className="size-3.5" aria-hidden="true" />
              </Button>
              <EntryMenu entry={entry} path={child} actions={actions} />
            </div>
            {open && <Directory path={child} actions={actions} />}
          </li>
        );
      })}
    </ul>
  );
}

export default function PersonalFiles({
  expanded,
  path: selectedPath,
  onPathChange,
  rootPath = '',
}: {
  expanded: boolean;
  path?: string;
  onPathChange?: (path: string) => void;
  rootPath?: string;
}) {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const client = useQueryClient();
  const { data: startup } = useGetStartupConfig();
  const input = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const pathAtom = useMemo(() => atom(''), []);
  const foldersAtom = useMemo(() => atom(new Set<string>()), []);
  const actionAtom = useMemo(() => atom<FileAction | null>(null), []);
  const downloadErrorAtom = useMemo(() => atom(false), []);
  const [folders, setFolders] = useAtom(foldersAtom);
  const [action, setAction] = useAtom(actionAtom);
  const [dirty, setDirty] = useAtom(spaceDirty(user?.id ?? 'anonymous'));
  const [downloadError, setDownloadError] = useAtom(downloadErrorAtom);
  const [localPath, setLocalPath] = useAtom(pathAtom);
  const candidate = selectedPath ?? localPath;
  const path =
    !rootPath || candidate === rootPath || candidate.startsWith(rootPath + '/')
      ? candidate
      : rootPath;
  const setPath = onPathChange ?? setLocalPath;
  useEffect(() => {
    if (!expanded || !selectedPath) return;
    const parts = selectedPath.split('/');
    setFolders((current) => {
      const next = new Set(current);
      parts.forEach((_part, index) => next.add(parts.slice(0, index + 1).join('/')));
      return next.size === current.size ? current : next;
    });
  }, [expanded, selectedPath, setFolders]);
  const space = useQuery<PersonalSpace>({
    queryKey: [QueryKeys.codechatSpace, user?.id],
    queryFn: async () => (await personalFileRequest(token!, 'ensure', 'POST')).json(),
    enabled: expanded && !!user?.id && !!token,
    retry: false,
    refetchInterval: expanded ? (data) => (data?.status === 'ready' ? 30000 : 5000) : false,
  });
  const projects = useQuery({
    queryKey: [QueryKeys.workspaceProjects, user?.id],
    queryFn: () => workspaceProjects(token!),
    enabled: expanded && !rootPath && !!user?.id && !!token && space.data?.status === 'ready',
    retry: false,
  });
  const upload = useMutation({
    mutationFn: async (file: globalThis.File) => {
      if (file.size > 16 * 1024 * 1024) throw new Error('file_too_large');
      await personalFileRequest(
        token!,
        'file',
        'PUT',
        path ? path + '/' + file.name : file.name,
        file,
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries([QueryKeys.codechatFiles, user?.id]);
      await client.invalidateQueries([QueryKeys.codechatUsage, user?.id]);
      await client.invalidateQueries([QueryKeys.codechatCapacity, user?.id]);
    },
    retry: false,
  });
  if (!expanded) return null;
  if (space.isError)
    return (
      <div role="alert">
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

  const actions: TreeActions = {
    projectLabels: new Map(projects.data?.projects.map((p) => [p.path, p.project_label ?? p.name])),
    selected: path,
    expanded: folders,
    toggle: (target, open) => {
      setFolders((previous) => {
        const next = new Set(previous);
        if (open) next.add(target);
        else next.delete(target);
        return next;
      });
      if (open || path === target || path.startsWith(target + '/')) {
        setPath(open ? target : target.split('/').slice(0, -1).join('/'));
      }
    },
    open: (next, trigger) => {
      if (dirty && !window.confirm(localize('com_codechat_file_unsaved'))) return;
      setDirty(false);
      triggerRef.current = trigger;
      setAction(next);
    },
    download: async (filePath, entry) => {
      setDownloadError(false);
      try {
        const result = await personalFileRequest(
          token!,
          entry.kind === 'directory' ? 'archive' : 'file',
          'GET',
          filePath,
        );
        const url = URL.createObjectURL(await result.blob());
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = entry.name + (entry.kind === 'directory' ? '.zip' : '');
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        setDownloadError(true);
      }
    },
  };
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center gap-1">
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
          size="xs"
          disabled={upload.isLoading}
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden="true" className="me-1 size-3.5" />
          {localize(upload.isLoading ? 'com_ui_loading' : 'com_ui_upload_files')}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          aria-pressed={path === rootPath}
          onClick={() => setPath(rootPath)}
        >
          {localize(rootPath ? 'com_project_root' : 'com_codechat_workspace_root')}
        </Button>
        <NewFolder path={path} />
        <Versions key={path} path={path} />
      </div>
      <p className="text-text-secondary h-4 truncate px-1 text-xs" title={path || '/'}>
        {localize('com_codechat_upload_to', { path: path || '/' })}
      </p>
      {upload.isError && <p role="alert">{localize('com_codechat_files_upload_error')}</p>}
      {downloadError && <p role="alert">{localize('com_codechat_files_error')}</p>}
      <div>
        <Directory path={rootPath} actions={actions} />
      </div>
      {action && (
        <FileDialog
          key={action.path + action.mode}
          action={action}
          triggerRef={triggerRef}
          maxBytes={startup?.codechat?.filePreviewMaxBytes ?? 1024 * 1024}
          onDirtyChange={setDirty}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}
