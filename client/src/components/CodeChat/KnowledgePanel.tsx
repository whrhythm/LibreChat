import { useAtomValue } from 'jotai';
import { activePanelAtom } from '~/Providers/ActivePanelContext';
import { useAuthContext, useLocalize } from '~/hooks';
import KnowledgeList from './KnowledgeList';

export default function KnowledgePanel() {
  const t = useLocalize();
  const { user } = useAuthContext();
  const active = useAtomValue(activePanelAtom) === 'knowledge-libraries';
  return (
    <section aria-label={t('com_library_title')} className="flex h-full min-h-0 flex-col text-sm">
      <header className="shrink-0 px-4 py-3">
        <h2 className="text-sm font-semibold">{t('com_library_title')}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        <KnowledgeList key={user?.id ?? 'anonymous'} enabled={active} />
      </div>
    </section>
  );
}
