import { useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { projectKnowledge, QueryKeys } from 'librechat-data-provider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KnowledgeImportInput, KnowledgeRevision } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { storageSize } from './storage';

export default function Knowledge({
  projectId,
  embedded = false,
  enabled = true,
}: {
  projectId: string;
  embedded?: boolean;
  enabled?: boolean;
}) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const cache = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const draftAtom = useMemo(() => atom<KnowledgeImportInput | null>(null), []);
  const [draft, setDraft] = useAtom(draftAtom);
  const errorAtom = useMemo(() => atom(false), []);
  const [invalid, setInvalid] = useAtom(errorAtom);
  const expandedAtom = useMemo(() => atom(embedded), [embedded]);
  const [expanded, setExpanded] = useAtom(expandedAtom);
  const key = [QueryKeys.aiProjects, user?.id, projectId, 'knowledge'];
  const list = useQuery({
    queryKey: key,
    queryFn: () => projectKnowledge(token!, projectId),
    enabled: enabled && expanded && !!token,
    retry: false,
    refetchInterval: (data) =>
      enabled && data?.revisions.some((r) => ['queued', 'indexing', 'deleting'].includes(r.state))
        ? 3000
        : false,
  });
  const save = useMutation({
    mutationFn: (input: KnowledgeImportInput | { id: string; action: 'retry' | 'remove' }) =>
      'request_id' in input
        ? projectKnowledge<KnowledgeRevision>(token!, projectId, '', input)
        : projectKnowledge<KnowledgeRevision>(
            token!,
            projectId,
            '/' + input.id + '/' + input.action,
            {},
          ),
    onSuccess: () => {
      setDraft(null);
      if (fileInput.current) fileInput.current.value = '';
    },
    onSettled: () => {
      void cache.invalidateQueries(key);
      void cache.invalidateQueries([QueryKeys.aiProjects, user?.id, projectId, 'trials']);
      void cache.invalidateQueries([QueryKeys.codechatCapacity, user?.id]);
    },
    retry: false,
  });
  const status = {
    queued: 'com_knowledge_queued',
    indexing: 'com_knowledge_indexing',
    ready: 'com_knowledge_ready',
    failed: 'com_knowledge_failed',
    deleting: 'com_knowledge_deleting',
    deleted: 'com_knowledge_deleted',
  } as const;
  const choose = async (files: FileList | null) => {
    setInvalid(false);
    save.reset();
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    if (
      selected.length > (list.data?.limits.files ?? 10) ||
      selected.some(
        (f) => !/\.(md|txt)$/i.test(f.name) || f.size > (list.data?.limits.file_bytes ?? 1048576),
      )
    ) {
      setInvalid(true);
      return;
    }
    try {
      const input = {
        request_id: crypto.randomUUID(),
        files: await Promise.all(
          selected.map(async (f) => ({
            name: f.name,
            content: new TextDecoder('utf-8', { fatal: true }).decode(await f.arrayBuffer()),
          })),
        ),
      };
      setDraft(input);
      save.mutate(input);
    } catch {
      setInvalid(true);
    }
  };
  function errorLabel() {
    if (invalid) return t('com_knowledge_invalid');
    if (save.error instanceof Error && save.error.message === 'knowledge_storage_full') {
      return t('com_knowledge_full');
    }
    return t('com_knowledge_error');
  }
  const Container = embedded ? 'section' : 'details';
  return (
    <Container
      className="border-border-light border-t pt-3"
      onToggle={(event) => {
        if (event.currentTarget instanceof HTMLDetailsElement)
          setExpanded(event.currentTarget.open);
      }}
    >
      {embedded ? (
        <h4 className="text-sm font-medium">{t('com_knowledge_title')}</h4>
      ) : (
        <summary className="cursor-pointer text-sm font-medium">{t('com_knowledge_title')}</summary>
      )}
      <div className="mt-2 space-y-2 text-xs">
        <p className="text-text-secondary">{t('com_knowledge_hint')}</p>
        <input
          ref={fileInput}
          type="file"
          accept=".md,.txt,text/plain,text/markdown"
          multiple
          className="hidden"
          aria-label={t('com_knowledge_import')}
          onChange={(e) => void choose(e.target.files)}
        />
        <Button
          size="xs"
          variant="outline"
          disabled={save.isLoading || !list.data}
          onClick={() => fileInput.current?.click()}
        >
          {t(save.isLoading ? 'com_knowledge_uploading' : 'com_knowledge_import')}
        </Button>
        {(invalid || save.isError || list.isError) && (
          <p role="alert">
            {errorLabel()}
            {!invalid && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => (draft ? save.mutate(draft) : void list.refetch())}
              >
                {t('com_codechat_retry')}
              </Button>
            )}
          </p>
        )}
        {list.isLoading && <p role="status">{t('com_knowledge_loading')}</p>}
        {list.data?.revisions.length === 0 && <p>{t('com_knowledge_empty')}</p>}
        {list.data?.revisions.map((row, index) => (
          <details
            key={row.id}
            open={
              list.data?.active_revision_id === row.id || (index === 0 && row.state !== 'deleted')
            }
            className="border-border-light space-y-2 border-t py-2"
          >
            <summary className="cursor-pointer text-xs">
              <span>{new Date(row.created_at).toLocaleString()}</span>
              <span role="status">
                {t(status[row.state])}
                {list.data?.active_revision_id === row.id ? ' · ' + t('com_knowledge_current') : ''}
              </span>
            </summary>
            {row.manifest.map((file) => (
              <div key={file.name} className="flex justify-between gap-2">
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
                <span>{storageSize(file.bytes)}</span>
              </div>
            ))}
            <p className="text-text-secondary">
              {t('com_knowledge_usage', { size: storageSize(row.source_bytes + row.index_bytes) })}
            </p>
            <div className="flex gap-2">
              {row.state === 'failed' && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={save.isLoading}
                  onClick={() => save.mutate({ id: row.id, action: 'retry' })}
                >
                  {t('com_codechat_retry')}
                </Button>
              )}
              {!['deleting', 'deleted'].includes(row.state) && (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={save.isLoading}
                  onClick={() => {
                    if (window.confirm(t('com_knowledge_remove_confirm')))
                      save.mutate({ id: row.id, action: 'remove' });
                  }}
                >
                  {t('com_knowledge_remove')}
                </Button>
              )}
            </div>
          </details>
        ))}
      </div>
    </Container>
  );
}
