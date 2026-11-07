import { useQuery } from '@tanstack/react-query';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogDescription, Button } from '@librechat/client';
import { projectKnowledge, QueryKeys } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

export default function KnowledgeSource({ open, onOpenChange, fileId, fileName }: {
  open: boolean; onOpenChange: (open: boolean) => void; fileId: string; fileName: string;
}) {
  const t = useLocalize();
  const { user, token } = useAuthContext();
  const parts = fileId.split(':');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const valid = parts.length === 4 && uuid.test(parts[1]) && uuid.test(parts[2]);
  const source = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id, 'source', fileId], enabled:open && !!token && valid,
    queryFn:()=>projectKnowledge<{name:string;content:string;revision_id:string}>(token!,parts[1],
      '/'+parts[2]+'/source?name='+parts[3]),retry:false,cacheTime:0,
  });
  return <OGDialog open={open} onOpenChange={onOpenChange}>
    <OGDialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
      <OGDialogTitle>{fileName}</OGDialogTitle>
      <OGDialogDescription>{t('com_knowledge_source_hint')}</OGDialogDescription>
      {source.isLoading && <p role="status">{t('com_knowledge_loading')}</p>}
      {(source.isError || !valid) && <p role="alert">{t('com_knowledge_error')}<Button variant="ghost" size="xs" onClick={()=>void source.refetch()}>{t('com_codechat_retry')}</Button></p>}
      {source.data && <div className="bg-surface-secondary overflow-auto rounded p-3 font-mono text-xs" aria-label={t('com_knowledge_source')}>
        {source.data.content.split('\n').map((line,index)=><div key={index} className="flex gap-3"><span aria-hidden="true" className="text-text-secondary w-8 shrink-0 select-none text-right">{index+1}</span><span className="whitespace-pre-wrap break-words">{line || ' '}</span></div>)}
      </div>}
    </OGDialogContent>
  </OGDialog>;
}
