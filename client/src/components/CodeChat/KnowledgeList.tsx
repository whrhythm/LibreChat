import { useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { BookOpen, Plus } from 'lucide-react';
import { libraryRequest, QueryKeys } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LibraryDetail } from 'librechat-data-provider';
import { LibraryDialog, libraryError } from './Library';
import { useAuthContext, useLocalize } from '~/hooks';

export default function KnowledgeList({ enabled }: { enabled: boolean }) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const cache = useQueryClient();
  const selectedAtom = useMemo(() => atom<string | null>(null), []);
  const [selected, setSelected] = useAtom(selectedAtom);
  const nameAtom = useMemo(() => atom<string | null>(null), []);
  const [name, setName] = useAtom(nameAtom);
  const requestId = useRef(crypto.randomUUID());
  const list = useQuery({
    queryKey: [QueryKeys.knowledgeLibraries, user?.id],
    queryFn: () => libraryRequest(token!),
    enabled: enabled && !!token,
    retry: false,
    refetchInterval: enabled ? 5000 : false,
  });
  const create = useMutation({
    mutationFn: () =>
      libraryRequest<LibraryDetail>(token!, '', { request_id: requestId.current, name }),
    onSuccess: (row) => {
      void cache.invalidateQueries([QueryKeys.knowledgeLibraries, user?.id]);
      setName(null);
      setSelected(row.id);
      requestId.current = crypto.randomUUID();
    },
  });
  return (
    <div className="space-y-3">
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => {
          setName('');
          create.reset();
        }}
      >
        <Plus className="me-1 size-4" />
        {t('com_library_create')}
      </Button>
      {name !== null && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <input
            aria-label={t('com_library_name')}
            maxLength={80}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              requestId.current = crypto.randomUUID();
            }}
            className="border-border-light bg-surface-primary rounded border p-2 text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={!name.trim() || create.isLoading} type="submit">
              {t('com_ui_create')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={create.isLoading}
              onClick={() => setName(null)}
            >
              {t('com_ui_cancel')}
            </Button>
          </div>
        </form>
      )}
      {create.isError && (
        <p role="alert" className="text-xs">
          {t(libraryError(create.error))}
        </p>
      )}
      {list.isLoading && <p role="status">{t('com_knowledge_loading')}</p>}
      {list.isError && (
        <p role="alert" className="text-xs">
          {t('com_knowledge_error')}
          <Button size="xs" variant="ghost" onClick={() => void list.refetch()}>
            {t('com_ui_retry')}
          </Button>
        </p>
      )}
      {list.isSuccess && !list.data.libraries.length && (
        <p className="text-text-secondary py-4 text-xs">{t('com_library_no_libraries')}</p>
      )}
      {list.data?.libraries.map((library) => (
        <button
          key={library.id}
          className="border-border-light hover:bg-surface-hover flex w-full items-center gap-3 rounded-lg border p-3 text-start"
          onClick={() => setSelected(library.id)}
        >
          <BookOpen className="size-4 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm">{library.name}</span>
            <span className="text-text-secondary text-xs">
              {t('com_library_file_count', { count: library.head?.manifest.length ?? 0 })}
            </span>
          </span>
        </button>
      ))}
      <LibraryDialog id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
