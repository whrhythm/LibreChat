import { useSetAtom } from 'jotai';
import { useRecoilValue } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { activePanelAtom } from '~/Providers/ActivePanelContext';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import { useAuthContext, useNewConvo } from '~/hooks';
import { projectInspector } from './navigation';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

/** Only explicit creation/start-chat actions may replace the central conversation. */
export default function useProjectChat() {
  const { user } = useAuthContext();
  const select = useSetAtom(projectInspector(user?.id ?? 'anonymous'));
  const setActive = useSetAtom(activePanelAtom);
  const { setSidebarOpen } = useSidebarToggle();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const conversationId = useRecoilValue(store.conversationIdByIndex(0));
  const { newConversation } = useNewConvo();
  return (projectId: string) => {
    clearMessagesCache(cache, conversationId);
    void cache.invalidateQueries([QueryKeys.messages]);
    navigate('/c/new?projectId=' + encodeURIComponent(projectId), { flushSync: true });
    newConversation({ template: { chatProjectId: projectId } });
    select(null);
    setActive('conversations');
    setSidebarOpen(true);
  };
}
