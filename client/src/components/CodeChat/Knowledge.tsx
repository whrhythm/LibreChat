import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { libraryRequest, projectLibrary, QueryKeys } from 'librechat-data-provider';
import { LibraryDialog, libraryError } from './Library';
import { useAuthContext, useLocalize } from '~/hooks';

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
  const expandedAtom = useMemo(() => atom(embedded), [embedded]);
  const [expanded, setExpanded] = useAtom(expandedAtom);
  const selectionAtom = useMemo(() => atom<string | null>(null), []);
  const [selection, setSelection] = useAtom(selectionAtom);
  const manageAtom = useMemo(() => atom<string | null>(null), []);
  const [manage, setManage] = useAtom(manageAtom);
  const active = enabled && expanded && !!token;
  const list = useQuery({
    queryKey: [QueryKeys.knowledgeLibraries, user?.id],
    queryFn: () => libraryRequest(token!),
    enabled: active,
    retry: false,
  });
  const binding = useQuery({
    queryKey: [QueryKeys.knowledgeLibraries, user?.id, 'project', projectId],
    queryFn: () => projectLibrary(token!, projectId),
    enabled: active,
    retry: false,
  });
  const bind = useMutation({
    mutationFn: () =>
      projectLibrary(token!, projectId, {
        library_id: selection || null,
        expected_library_id: binding.data?.library?.id ?? null,
      }),
    onSuccess: () => {
      setSelection(null);
      void cache.invalidateQueries([QueryKeys.knowledgeLibraries, user?.id]);
      void cache.invalidateQueries([QueryKeys.aiProjects, user?.id]);
    },
  });
  const Container = embedded ? 'section' : 'details';
  return (
    <Container
      className="space-y-3"
      onToggle={(e) => setExpanded((e.currentTarget as HTMLDetailsElement).open)}
    >
      {!embedded && (
        <summary className="cursor-pointer text-sm font-medium">{t('com_knowledge_title')}</summary>
      )}
      {(list.isLoading || binding.isLoading) && <p role="status">{t('com_knowledge_loading')}</p>}
      {(list.isError || binding.isError || bind.isError) && (
        <p role="alert" className="text-xs">
          {t(libraryError(bind.error || list.error || binding.error))}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              void list.refetch();
              void binding.refetch();
            }}
          >
            {t('com_ui_retry')}
          </Button>
        </p>
      )}
      <label className="block text-sm">
        {t('com_library_binding')}
        <select
          aria-label={t('com_library_binding')}
          className="border-border-light bg-surface-primary mt-2 w-full rounded border p-2"
          disabled={!list.isSuccess || !binding.isSuccess || bind.isLoading}
          value={selection ?? binding.data?.library?.id ?? ''}
          onChange={(e) => setSelection(e.target.value)}
        >
          <option value="">{t('com_library_unbound')}</option>
          {list.data?.libraries.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-text-secondary text-xs">{t('com_library_binding_hint')}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={selection === null || bind.isLoading || !binding.isSuccess}
          onClick={() => bind.mutate()}
        >
          {t('com_ui_save')}
        </Button>
        {binding.data?.library && (
          <Button size="sm" variant="outline" onClick={() => setManage(binding.data!.library!.id)}>
            {t('com_library_manage')}
          </Button>
        )}
      </div>
      {!list.data?.libraries.length && list.isSuccess && (
        <p className="text-text-secondary text-xs">{t('com_library_create_hint')}</p>
      )}
      <LibraryDialog id={manage} onClose={() => setManage(null)} />
    </Container>
  );
}
