import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectKnowledge, applicationSource, QueryKeys } from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
  Button,
} from '@librechat/client';
import { useAuthContext, useLocalize } from '~/hooks';
import { lazyWithRecovery } from '~/lib/assets/lazy';
import EditorLoading from './EditorLoading';

const CodeEditor = lazyWithRecovery(() => import('./CodeEditor'));

export default function KnowledgeSource({
  open,
  onOpenChange,
  fileId,
  fileName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  fileName: string;
}) {
  const t = useLocalize();
  const { user, token } = useAuthContext();
  const parts = fileId.split(':');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const valid = parts.length === 4 && uuid.test(parts[1]) && uuid.test(parts[2]);
  const source = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id, 'source', fileId],
    enabled: open && !!token && valid,
    queryFn: () =>
      parts[0] === 'appknowledge' ? applicationSource(token!, parts[1], parts[3]) : projectKnowledge<{ name: string; content: string; revision_id: string }>(
        token!,
        parts[1],
        '/' + parts[2] + '/source?name=' + parts[3],
      ),
    retry: false,
    cacheTime: 0,
  });
  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <OGDialogTitle>{fileName}</OGDialogTitle>
        <OGDialogDescription>{t('com_knowledge_source_hint')}</OGDialogDescription>
        {source.isLoading && <p role="status">{t('com_knowledge_loading')}</p>}
        {(source.isError || !valid) && (
          <p role="alert">
            {t('com_knowledge_error')}
            <Button variant="ghost" size="xs" onClick={() => void source.refetch()}>
              {t('com_codechat_retry')}
            </Button>
          </p>
        )}
        {source.data && (
          <div className="h-[60vh] overflow-hidden">
            <Suspense fallback={<EditorLoading />}>
              <CodeEditor
                name={'knowledge://' + parts[1] + '/' + parts[2] + '/' + source.data.name}
                value={source.data.content}
                readOnly
                onChange={() => undefined}
                label={t('com_knowledge_source')}
              />
            </Suspense>
          </div>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}
