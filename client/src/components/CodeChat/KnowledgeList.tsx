import { useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { aiProjects, QueryKeys } from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import { useAuthContext, useLocalize } from '~/hooks';
import Knowledge from './Knowledge';

/** Existing project-bound revisions only; independent multi-library management is not implied. */
export default function KnowledgeList({ enabled }: { enabled: boolean }) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const selectedAtom = useMemo(() => atom<string | null>(null), []);
  const [selected, setSelected] = useAtom(selectedAtom);
  const trigger = useRef<HTMLElement | null>(null);
  const list = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id],
    queryFn: () => aiProjects(token!),
    enabled: enabled && !!token,
    retry: false,
  });
  const projects = list.data?.projects.filter((v) => v.state === 'ready') ?? [];
  return (
    <div className="space-y-2">
      <p className="text-text-secondary text-xs">{t('com_assets_knowledge_scope')}</p>
      {list.isError && (
        <div role="alert">
          <p>{t('com_project_status_error')}</p>
          <Button size="xs" variant="ghost" onClick={() => void list.refetch()}>
            {t('com_ui_retry')}
          </Button>
        </div>
      )}
      {list.isLoading && <p role="status">{t('com_ui_loading')}</p>}
      {list.isSuccess && projects.length === 0 && (
        <p className="text-text-secondary text-xs">{t('com_assets_no_project_knowledge')}</p>
      )}
      {projects.map((v) => (
        <Button
          key={v.project.id}
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setSelected(v.project.id);
          }}
        >
          <span className="truncate">{v.project.name}</span>
        </Button>
      ))}
      <OGDialog
        open={selected !== null}
        triggerRef={trigger}
        onOpenChange={(value) => {
          if (!value) setSelected(null);
        }}
      >
        <OGDialogContent placement="center" className="max-h-[90vh] overflow-auto sm:max-w-4xl">
          <OGDialogTitle>{t('com_assets_project_knowledge')}</OGDialogTitle>
          <OGDialogDescription>
            {projects.find((v) => v.project.id === selected)?.project.name}
          </OGDialogDescription>
          {selected && <Knowledge key={selected} projectId={selected} embedded enabled={enabled} />}
          <Button variant="outline" onClick={() => setSelected(null)}>
            {t('com_project_return_chat')}
          </Button>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
