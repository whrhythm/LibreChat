import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { personalFileRequest, PersonalFileError, QueryKeys } from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
  Textarea,
} from '@librechat/client';
import type { WorkspaceEntry } from 'librechat-data-provider';
import type { RefObject } from 'react';
import { useAuthContext, useLocalize } from '~/hooks';

export type FileAction = {
  entry: WorkspaceEntry;
  path: string;
  mode: 'preview' | 'edit' | 'delete';
};
const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};
const titleKeys = {
  edit: 'com_codechat_file_edit',
  delete: 'com_codechat_file_delete',
  preview: 'com_codechat_file_preview',
} as const;

export default function FileDialog({
  action,
  onClose,
  maxBytes,
  triggerRef,
  inline = false,
  onDirtyChange,
}: {
  action: FileAction;
  onClose: () => void;
  maxBytes: number;
  triggerRef: RefObject<HTMLElement | null>;
  inline?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { token, user } = useAuthContext();
  const localize = useLocalize();
  const client = useQueryClient();
  const [text, setText] = useState('');
  const [original, setOriginal] = useState('');
  const [version, setVersion] = useState(action.entry.etag || '');
  const [discard, setDiscard] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const initialized = useRef(false);
  const extension = action.entry.name.split('.').pop()?.toLowerCase();
  const imageType = extension ? imageTypes[extension] : undefined;
  const content = useQuery({
    queryKey: [QueryKeys.codechatFiles, user?.id, action.path, 'content'],
    queryFn: async () => {
      if ((action.entry.size || 0) > maxBytes) throw new Error('unsupported');
      const response = await personalFileRequest(token!, 'file', 'GET', action.path);
      const data = await response.arrayBuffer();
      if (data.byteLength > maxBytes) throw new Error('unsupported');
      if (imageType && action.mode === 'preview') {
        return { bytes: data, text: '', version: response.headers.get('etag') || '' };
      }
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(data);
      if (decoded.includes('\0')) throw new Error('unsupported');
      return { bytes: null, text: decoded, version: response.headers.get('etag') || '' };
    },
    enabled: action.mode !== 'delete' && !!token,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    cacheTime: 0,
  });
  useEffect(() => {
    if (!content.data || content.isFetching || initialized.current) return;
    initialized.current = true;
    setText(content.data.text);
    setOriginal(content.data.text);
    setVersion(content.data.version);
  }, [content.data, content.isFetching]);
  useEffect(() => {
    if (content.data?.bytes && imageType) {
      const url = URL.createObjectURL(new Blob([content.data.bytes], { type: imageType }));
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [content.data, imageType]);
  const mutation = useMutation({
    mutationFn: async () => {
      if (action.mode === 'delete') {
        await personalFileRequest(token!, 'file', 'DELETE', action.path, undefined, { version });
      } else {
        const body = new Blob([text], { type: 'application/octet-stream' });
        if (body.size > maxBytes) throw new Error('unsupported');
        await personalFileRequest(token!, 'file', 'PUT', action.path, body, {
          version,
          overwrite: true,
        });
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries([QueryKeys.codechatFiles, user?.id]);
      await client.invalidateQueries([QueryKeys.codechatUsage, user?.id]);
      await client.invalidateQueries([QueryKeys.codechatCapacity, user?.id]);
      onClose();
    },
    retry: false,
  });
  const dirty = action.mode === 'edit' && text !== original;
  useEffect(() => {
    onDirtyChange?.(dirty);
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      onDirtyChange?.(false);
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty, onDirtyChange]);
  const close = () => {
    if (mutation.isLoading) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const conflict =
    mutation.error instanceof PersonalFileError && mutation.error.code === 'conflict';
  const full = mutation.error instanceof PersonalFileError && mutation.error.code === 'full';
  function fileContent() {
    if (action.mode === 'delete') return <p>{localize('com_codechat_file_delete_notice')}</p>;
    if (content.isLoading) return <p role="status">{localize('com_ui_loading')}</p>;
    if (content.isError)
      return (
        <p role="alert">
          {localize('com_codechat_file_unsupported', { limit: Math.floor(maxBytes / 1024) })}
        </p>
      );
    if (action.mode === 'edit')
      return (
        <Textarea
          variant="code"
          aria-label={localize('com_codechat_file_content')}
          className="min-h-64 flex-1 resize-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      );
    if (imageUrl)
      return (
        <img
          src={imageUrl}
          alt={action.entry.name}
          className="max-h-96 max-w-full object-contain"
        />
      );
    return (
      <pre className="max-h-96 overflow-auto font-mono text-sm break-words whitespace-pre-wrap">
        {text}
      </pre>
    );
  }
  function failureMessage() {
    if (conflict) return localize('com_codechat_file_conflict');
    if (full) return localize('com_codechat_file_full');
    return localize('com_codechat_files_error');
  }
  function submitLabel() {
    if (mutation.isLoading) return localize('com_ui_loading');
    if (action.mode === 'delete') return localize('com_codechat_file_delete_confirm');
    return localize('com_ui_save');
  }
  if (inline)
    return (
      <section
        aria-label={localize(titleKeys[action.mode], { name: action.entry.name })}
        className="border-border-light bg-surface-primary mt-3 flex flex-col gap-3 border-t pt-3"
      >
        <header className="flex min-w-0 items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold" title={action.path}>
            {action.path}
          </h3>
          {dirty && (
            <span className="text-text-secondary shrink-0 text-xs">
              {localize('com_codechat_unsaved')}
            </span>
          )}
        </header>
        {fileContent()}
        {mutation.isError && <p role="alert">{failureMessage()}</p>}
        {conflict && <p>{localize('com_codechat_file_conflict_recovery')}</p>}
        {discard ? (
          <div role="alert" className="flex flex-col gap-2">
            <p>{localize('com_codechat_file_unsaved')}</p>
            <Button onClick={onClose}>{localize('com_codechat_file_discard')}</Button>
            <Button variant="outline" onClick={() => setDiscard(false)}>
              {localize('com_codechat_file_keep_editing')}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              disabled={
                mutation.isLoading || !version || !dirty || content.isLoading || content.isError
              }
              onClick={() => mutation.mutate()}
            >
              {submitLabel()}
            </Button>
            <Button variant="outline" disabled={mutation.isLoading} onClick={close}>
              {localize('com_ui_close')}
            </Button>
          </div>
        )}
      </section>
    );
  return (
    <OGDialog
      open
      triggerRef={triggerRef}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <OGDialogContent
        placement={action.mode === 'edit' ? 'right' : 'center'}
        className={action.mode === 'edit' ? 'max-w-2xl' : 'max-w-3xl'}
      >
        <OGDialogTitle>
          {localize(titleKeys[action.mode], { name: action.entry.name })}
        </OGDialogTitle>
        <OGDialogDescription className="break-all">{action.path}</OGDialogDescription>
        {fileContent()}
        {mutation.isError && <p role="alert">{failureMessage()}</p>}
        {conflict && <p>{localize('com_codechat_file_conflict_recovery')}</p>}
        {discard ? (
          <div role="alert" className="flex flex-col gap-2">
            <p>{localize('com_codechat_file_unsaved')}</p>
            <Button onClick={onClose}>{localize('com_codechat_file_discard')}</Button>
            <Button variant="outline" onClick={() => setDiscard(false)}>
              {localize('com_codechat_file_keep_editing')}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" disabled={mutation.isLoading} onClick={close}>
              {localize('com_ui_close')}
            </Button>
            {action.mode !== 'preview' && (
              <Button
                disabled={
                  mutation.isLoading ||
                  !version ||
                  (action.mode === 'edit' && (!dirty || content.isLoading || content.isError))
                }
                onClick={() => mutation.mutate()}
              >
                {submitLabel()}
              </Button>
            )}
          </div>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}
