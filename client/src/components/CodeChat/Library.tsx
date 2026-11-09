import { Suspense, useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { libraryRequest, QueryKeys } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import {
  ChevronRight,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Pencil,
  RefreshCw,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import type { LibraryDetail, LibraryEdit } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { lazyWithRecovery } from '~/lib/assets/lazy';
import EditorLoading from './EditorLoading';
import { storageSize } from './storage';

const CodeEditor = lazyWithRecovery(() => import('./CodeEditor'));
const states = {
  queued: 'com_library_indexing',
  indexing: 'com_library_indexing',
  ready: 'com_library_ready',
  failed: 'com_library_failed',
  deleting: 'com_knowledge_deleting',
  deleted: 'com_knowledge_deleted',
} as const;

export function libraryError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'knowledge_version_conflict') return 'com_library_conflict';
  if (code === 'knowledge_library_in_use' || code === 'knowledge_release_in_use')
    return 'com_library_in_use';
  if (code === 'knowledge_storage_full') return 'com_knowledge_full';
  if (code === 'knowledge_revision_limit') return 'com_library_revision_limit';
  if (code === 'knowledge_file_exists') return 'com_library_file_exists';
  if (code === 'knowledge_library_limit') return 'com_library_limit';
  if (/^knowledge_(invalid|file_|chunk_)/.test(code)) return 'com_knowledge_invalid';
  return 'com_knowledge_error';
}

type Selection = { name: string; revision: string; mode: 'preview' | 'edit' | 'rename' | 'remove' };

function FileView({
  libraryId,
  selected,
  onClose,
  onDirty,
  onChanged,
}: {
  libraryId: string;
  selected: Selection;
  onClose: (saved?: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onChanged: () => void;
}) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const editAtom = useMemo(() => atom<string | null>(null), []);
  const [content, setContent] = useAtom(editAtom);
  const modeAtom = useMemo(() => atom(selected.mode), [selected.mode]);
  const [mode, setMode] = useAtom(modeAtom);
  const nameAtom = useMemo(() => atom(selected.name), [selected.name]);
  const [name, setName] = useAtom(nameAtom);
  const requestId = useRef(crypto.randomUUID());
  const source = useQuery({
    queryKey: [QueryKeys.knowledgeLibraries, user?.id, libraryId, selected.revision, selected.name],
    queryFn: () =>
      libraryRequest<{ content: string }>(
        token!,
        '/' +
          libraryId +
          '/source?revision_id=' +
          selected.revision +
          '&name=' +
          encodeURIComponent(selected.name),
      ),
    enabled: !!token,
    retry: false,
    cacheTime: 0,
  });
  const save = useMutation({
    mutationFn: () => {
      const base = { request_id: requestId.current, expected_revision_id: selected.revision };
      let body: LibraryEdit = {
        ...base,
        action: 'upsert',
        files: [{ name: selected.name, content: content ?? source.data?.content ?? '' }],
      };
      if (mode === 'remove') body = { ...base, action: 'remove', name: selected.name };
      if (mode === 'rename')
        body = { ...base, action: 'rename', name: selected.name, new_name: name };
      return libraryRequest<LibraryDetail>(token!, '/' + libraryId + '/files', body);
    },
    onSuccess: () => {
      onDirty(false);
      onChanged();
      onClose(true);
    },
  });
  return (
    <section
      className="border-border-light flex min-w-0 flex-col gap-3 rounded-lg border p-3"
      aria-label={selected.name}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold">{selected.name}</h3>
        <div className="flex gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('com_library_edit')}
            disabled={!source.data || save.isLoading}
            onClick={() => setMode('edit')}
          >
            <Pencil className="size-4" />
          </Button>
          <Button size="xs" variant="ghost" disabled={save.isLoading} onClick={() => onClose()}>
            {t('com_ui_close')}
          </Button>
        </div>
      </header>
      {source.isLoading && <p role="status">{t('com_knowledge_loading')}</p>}
      {source.isError && (
        <p role="alert">
          {t(libraryError(source.error))}
          <Button size="xs" variant="ghost" onClick={() => void source.refetch()}>
            {t('com_ui_retry')}
          </Button>
        </p>
      )}
      {mode === 'rename' && (
        <label className="text-xs">
          {t('com_library_filename')}
          <input
            className="border-border-light bg-surface-primary mt-1 w-full rounded border p-2"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              onDirty(true);
              requestId.current = crypto.randomUUID();
            }}
          />
        </label>
      )}
      {mode === 'remove' && <p className="text-sm">{t('com_library_remove_file_hint')}</p>}
      {source.data && mode !== 'remove' && (
        <div className="h-[48vh] min-h-64 overflow-hidden">
          <Suspense fallback={<EditorLoading />}>
            <CodeEditor
              name={'knowledge://' + libraryId + '/' + selected.revision + '/' + selected.name}
              value={content ?? source.data.content}
              readOnly={mode !== 'edit' || save.isLoading}
              label={t('com_knowledge_source')}
              onChange={(v) => {
                setContent(v);
                onDirty(v !== source.data?.content);
                requestId.current = crypto.randomUUID();
              }}
            />
          </Suspense>
        </div>
      )}
      {save.isError && (
        <p role="alert" className="text-xs">
          {t(libraryError(save.error))}
        </p>
      )}
      {mode !== 'preview' && (
        <Button
          variant={mode === 'remove' ? 'destructive' : 'default'}
          disabled={
            !source.data ||
            save.isLoading ||
            (mode === 'edit' && (content === null || content === source.data.content)) ||
            (mode === 'rename' && (!name.trim() || name === selected.name))
          }
          onClick={() => save.mutate()}
        >
          {save.isLoading && t('com_ui_loading')}
          {!save.isLoading && t(mode === 'remove' ? 'com_library_confirm_remove' : 'com_ui_save')}
        </Button>
      )}
    </section>
  );
}

export default function Library({
  id,
  onClose,
  onDirty,
  enabled = true,
}: {
  id: string;
  onClose: () => void;
  onDirty: (dirty: boolean) => void;
  enabled?: boolean;
}) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const cache = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const selectedAtom = useMemo(() => atom<Selection | null>(null), []);
  const [selected, setSelected] = useAtom(selectedAtom);
  const dirtyAtom = useMemo(() => atom(false), []);
  const [dirty, setDirty] = useAtom(dirtyAtom);
  const nameAtom = useMemo(() => atom<string | null>(null), []);
  const [name, setName] = useAtom(nameAtom);
  const deleteAtom = useMemo(() => atom(false), []);
  const [removing, setRemoving] = useAtom(deleteAtom);
  const invalidAtom = useMemo(() => atom(false), []);
  const [invalid, setInvalid] = useAtom(invalidAtom);
  const request = useRef<{ path: string; body: object } | null>(null);
  const list = useQuery({
    queryKey: [QueryKeys.knowledgeLibraries, user?.id, id],
    queryFn: () => libraryRequest<LibraryDetail>(token!, '/' + id),
    enabled: !!token && enabled,
    retry: false,
    refetchInterval: 3000,
  });
  const changed = () => {
    void cache.invalidateQueries([QueryKeys.knowledgeLibraries, user?.id]);
    void cache.invalidateQueries([QueryKeys.aiProjects, user?.id]);
    void cache.invalidateQueries([QueryKeys.codechatCapacity, user?.id]);
  };
  const mutate = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) =>
      libraryRequest(token!, '/' + id + path, body),
    onSuccess: (_, variables) => {
      changed();
      if (variables.path === '/remove') onClose();
      setInvalid(false);
      request.current = null;
    },
  });
  const perform = (path: string, body: object) => {
    request.current = { path, body };
    mutate.mutate(request.current);
  };
  const markDirty = (v: boolean) => {
    setDirty(v);
    onDirty(v);
  };
  const select = (value: Selection | null) => {
    if (dirty && !window.confirm(t('com_codechat_file_unsaved'))) return;
    markDirty(false);
    setSelected(value);
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length || !list.data) return;
    setInvalid(false);
    const chosen = Array.from(files);
    if (
      chosen.length > list.data.limits.files ||
      chosen.some((f) => !/\.(md|txt)$/i.test(f.name) || f.size > list.data!.limits.file_bytes)
    ) {
      setInvalid(true);
      return;
    }
    try {
      perform('/files', {
        request_id: crypto.randomUUID(),
        expected_revision_id: list.data.head_revision_id,
        action: 'upsert',
        files: await Promise.all(
          chosen.map(async (f) => ({
            name: f.name,
            content: new TextDecoder('utf-8', { fatal: true }).decode(await f.arrayBuffer()),
          })),
        ),
      });
    } catch {
      setInvalid(true);
    }
  };
  const data = list.data;
  const head = data?.head;
  return (
    <div className="space-y-4 text-sm">
      {list.isLoading && <p role="status">{t('com_knowledge_loading')}</p>}
      {list.isError && (
        <p role="alert">
          {t('com_knowledge_error')}
          <Button size="xs" variant="ghost" onClick={() => void list.refetch()}>
            {t('com_ui_retry')}
          </Button>
        </p>
      )}
      {data && (
        <>
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{data.name}</h2>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={mutate.isLoading || dirty}
                onClick={() => input.current?.click()}
              >
                <Upload className="me-1 size-4" />
                {t('com_library_upload')}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('com_assets_refresh')}
                onClick={() => void list.refetch()}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </header>
          <input
            ref={input}
            aria-label={t('com_library_upload')}
            type="file"
            multiple
            accept=".md,.txt"
            hidden
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="text-text-secondary flex flex-wrap gap-3 text-xs">
            <span>{head ? t(states[head.state]) : t('com_library_empty')}</span>
            <span>{t('com_library_file_count', { count: head?.manifest.length ?? 0 })}</span>
            <span>
              {t('com_library_storage', {
                size: storageSize(
                  data.revisions.reduce(
                    (sum, revision) => sum + revision.source_bytes + revision.index_bytes,
                    0,
                  ),
                ),
              })}
            </span>
          </div>
          <p className="text-text-secondary text-xs">
            {t('com_library_formats', {
              count: data.limits.files,
              size: storageSize(data.limits.file_bytes),
            })}
          </p>
          {head && data.active_revision_id !== head.id && (
            <p className="text-xs" role="status">
              {data.active_revision_id
                ? t('com_library_previous_active')
                : t('com_library_wait_index')}
            </p>
          )}
          {head?.state === 'failed' && (
            <Button
              size="sm"
              variant="outline"
              disabled={mutate.isLoading}
              onClick={() => perform('/retry', {})}
            >
              {t('com_ui_retry')}
            </Button>
          )}
          {(invalid || mutate.isError) && (
            <div role="alert" className="text-xs">
              <p>{t(invalid ? 'com_knowledge_invalid' : libraryError(mutate.error))}</p>
              {mutate.isError && request.current && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => request.current && mutate.mutate(request.current)}
                >
                  {t('com_ui_retry')}
                </Button>
              )}
            </div>
          )}
          <div
            className={
              selected ? 'grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]' : 'grid gap-4'
            }
          >
            <div className="min-w-0">
              <details open className="group border-border-light rounded-md border">
                <summary className="hover:bg-surface-hover flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 text-sm [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="size-3.5 shrink-0 group-open:rotate-90"
                    aria-hidden="true"
                  />
                  <Folder className="size-4 shrink-0 group-open:hidden" aria-hidden="true" />
                  <FolderOpen
                    className="hidden size-4 shrink-0 group-open:block"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate" title={data.name}>
                    {data.name}
                  </span>
                  <span className="text-text-secondary text-xs">{head?.manifest.length ?? 0}</span>
                </summary>
                <ul
                  className="border-border-light ms-4 max-h-80 overflow-y-auto border-s py-1"
                  aria-label={t('com_library_files')}
                >
                  {head?.manifest.map((file) => (
                    <li
                      key={file.name}
                      className={`hover:bg-surface-hover flex min-w-0 items-center gap-1 pe-1 ${selected?.name === file.name ? 'bg-surface-active' : ''}`}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-start"
                        aria-pressed={selected?.name === file.name}
                        title={
                          file.name +
                          ' · ' +
                          storageSize(file.bytes) +
                          ' · ' +
                          t(states[head.state])
                        }
                        onClick={() =>
                          select({ name: file.name, revision: head.id, mode: 'preview' })
                        }
                      >
                        <FileText
                          className="text-text-secondary size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{file.name}</span>
                          <span className="text-text-secondary block truncate text-xs">
                            {storageSize(file.bytes)} · {t(states[head.state])}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 gap-0.5">
                        {(
                          [
                            { mode: 'preview', icon: Eye, key: 'com_library_preview' },
                            { mode: 'edit', icon: Pencil, key: 'com_library_edit' },
                            { mode: 'rename', icon: Type, key: 'com_library_rename' },
                            { mode: 'remove', icon: Trash2, key: 'com_library_remove' },
                          ] as const
                        ).map((action) => (
                          <Button
                            key={action.mode}
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t(action.key) + ' ' + file.name}
                            disabled={mutate.isLoading}
                            onClick={() =>
                              select({ name: file.name, revision: head.id, mode: action.mode })
                            }
                          >
                            <action.icon className="size-3.5" aria-hidden="true" />
                          </Button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                {!head?.manifest.length && (
                  <p className="text-text-secondary py-8 text-center text-sm">
                    {t('com_library_upload_hint')}
                  </p>
                )}
              </details>
            </div>
            {selected && (
              <FileView
                key={selected.name + selected.revision + selected.mode}
                libraryId={id}
                selected={selected}
                onDirty={markDirty}
                onChanged={changed}
                onClose={(saved) => {
                  if (saved) {
                    markDirty(false);
                    setSelected(null);
                  } else select(null);
                }}
              />
            )}
          </div>
          <details className="border-border-light border-t pt-3">
            <summary className="cursor-pointer text-xs">{t('com_library_history')}</summary>
            <p className="text-text-secondary my-2 text-xs">{t('com_library_history_hint')}</p>
            {data.revisions.map((revision) => (
              <div
                key={revision.id}
                className="flex items-center justify-between gap-2 py-1 text-xs"
              >
                <span>
                  {new Date(revision.created_at).toLocaleString()} · {t(states[revision.state])} ·{' '}
                  {storageSize(revision.source_bytes + revision.index_bytes)}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={
                    mutate.isLoading ||
                    revision.id === data.head_revision_id ||
                    revision.id === data.active_revision_id ||
                    revision.state === 'deleting'
                  }
                  onClick={() => {
                    if (window.confirm(t('com_library_cleanup_confirm')))
                      perform('/cleanup', { revision_id: revision.id });
                  }}
                >
                  {t('com_library_cleanup')}
                </Button>
              </div>
            ))}
          </details>
          <details className="border-border-light border-t pt-3">
            <summary className="cursor-pointer text-xs">{t('com_library_settings')}</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                aria-label={t('com_library_name')}
                className="border-border-light bg-surface-primary min-w-0 flex-1 rounded border px-2"
                value={name ?? data.name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={mutate.isLoading || !name?.trim() || name === data.name}
                onClick={() => perform('/rename', { name, expected_version: data.version })}
              >
                {t('com_ui_save')}
              </Button>
            </div>
            <p className="text-text-secondary my-2 text-xs">
              {t('com_library_references', {
                projects: data.references.projects.map((p) => p.name).join('、') || '—',
                count: data.references.fixed_trials,
              })}
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={mutate.isLoading || dirty}
              onClick={() => setRemoving(!removing)}
            >
              {t('com_library_delete')}
            </Button>
            {removing && (
              <div className="mt-2 space-y-2">
                <p>{t('com_library_delete_hint')}</p>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={mutate.isLoading}
                  onClick={() => perform('/remove', {})}
                >
                  {t('com_library_confirm_remove')}
                </Button>
              </div>
            )}
          </details>
        </>
      )}
    </div>
  );
}

export function LibraryDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useLocalize();
  const dirty = useRef(false);
  const close = () => {
    if (dirty.current && !window.confirm(t('com_codechat_file_unsaved'))) return;
    dirty.current = false;
    onClose();
  };
  return (
    <OGDialog
      open={!!id}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <OGDialogContent placement="center" className="max-h-[90vh] overflow-auto sm:max-w-5xl">
        <OGDialogTitle>{t('com_library_title')}</OGDialogTitle>
        <OGDialogDescription>{t('com_library_private')}</OGDialogDescription>
        {id && (
          <Library
            key={id}
            id={id}
            onClose={close}
            onDirty={(v) => {
              dirty.current = v;
            }}
          />
        )}
        <Button variant="outline" onClick={close}>
          {t('com_project_return_chat')}
        </Button>
      </OGDialogContent>
    </OGDialog>
  );
}
