import { Button } from '@librechat/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { syncWorkspaceProjects, QueryKeys } from 'librechat-data-provider';
import { isCodeChatEnabled } from '~/components/CodeChat/config';
import { useAuthContext, useLocalize } from '~/hooks';

export default function ProjectSync() {
  const { user, token } = useAuthContext();
  const cache = useQueryClient();
  const t = useLocalize();
  const query = useQuery({
    queryKey: [QueryKeys.projectLinks, user?.id],
    queryFn: () => syncWorkspaceProjects(token!),
    enabled: !!user?.id && !!token && isCodeChatEnabled(),
    staleTime: 300000,
    retry: false,
    onSuccess: () => {
      void cache.invalidateQueries([QueryKeys.projects]);
    },
  });
  if (!query.isError) return null;
  return (
    <div role="alert" className="p-2 text-xs">
      {t('com_ai_projects_load_error')}
      <Button size="xs" variant="ghost" onClick={() => void query.refetch()}>
        {t('com_codechat_retry')}
      </Button>
    </div>
  );
}
