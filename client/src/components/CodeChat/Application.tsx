import { Button } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { projectReleases } from 'librechat-data-provider';
import type { AIAppEntry } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

export default function Application() {
  const { projectId } = useParams();
  const { token, user } = useAuthContext();
  const t = useLocalize();
  const launch = useMutation({
    mutationFn: () => projectReleases<AIAppEntry>(token!, projectId!, '/launch', {}),
    retry: false,
  });
  return (
    <main className="bg-surface-primary text-text-primary mx-auto flex w-full max-w-2xl flex-col gap-5 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">
        {launch.data?.name ?? t('com_releases_application')}
      </h1>
      <p>{t('com_releases_member_hint')}</p>
      <p className="text-text-secondary text-sm break-all">
        {t('com_releases_my_id')} <code>{user?.id}</code>
      </p>
      {!launch.data && (
        <Button disabled={!token || launch.isLoading} onClick={() => launch.mutate()}>
          {t(launch.isLoading ? 'com_releases_working' : 'com_releases_enter')}
        </Button>
      )}
      {launch.isError && <p role="alert">{t('com_releases_denied')}</p>}
      {launch.data && (
        <>
          <p>
            {t('com_releases_current')} {launch.data.number} · {t('com_releases_creator_pays')}
          </p>
          <a
            className="border-border-light bg-surface-secondary rounded-lg border p-4 text-center font-medium"
            href={'/c/new?endpoint=agents&agent_id=' + encodeURIComponent(launch.data.agent_id)}
          >
            {t('com_releases_chat')}
          </a>
          <p className="text-text-secondary text-sm">{t('com_releases_version_hint')}</p>
        </>
      )}
    </main>
  );
}
