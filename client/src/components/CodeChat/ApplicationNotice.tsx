import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, useToastContext } from '@librechat/client';
import { personalApplicationRequest, QueryKeys } from 'librechat-data-provider';
import type { PersonalApplication } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';

/** Keep delivery outcomes visible even when the personal file panel is closed. */
export default function ApplicationNotice({ onOpen }: { onOpen: () => void }) {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const previous = useRef<{ owner?: string; statuses: Map<string, string> }>({
    statuses: new Map(),
  });
  const apps = useQuery<{ apps: PersonalApplication[] }>({
    queryKey: [QueryKeys.codechatApps, user?.id],
    queryFn: async () => (await personalApplicationRequest(token!, 'list')).json(),
    enabled: !!user?.id && !!token,
    refetchInterval: 5000,
    retry: false,
  });
  useEffect(() => {
    if (!apps.data) return;
    const old =
      previous.current.owner === user?.id ? previous.current.statuses : new Map<string, string>();
    for (const app of apps.data.apps) {
      if (
        old.has(app.id) &&
        old.get(app.id) !== app.status &&
        ['failed', 'running'].includes(app.status)
      ) {
        showToast({
          message: localize(
            app.status === 'failed'
              ? 'com_codechat_app_notify_failed'
              : 'com_codechat_app_notify_running',
            { name: app.project_path },
          ),
          severity:
            app.status === 'failed' ? NotificationSeverity.ERROR : NotificationSeverity.SUCCESS,
          showIcon: true,
        });
      }
    }
    previous.current = {
      owner: user?.id,
      statuses: new Map(apps.data.apps.map((app) => [app.id, app.status])),
    };
  }, [apps.data, user?.id, localize, showToast]);
  const failures = apps.data?.apps.filter((app) => app.status === 'failed').length || 0;
  return failures > 0 ? (
    <div role="alert" className="px-3 py-1 text-xs">
      <Button variant="ghost" onClick={onOpen}>
        {localize('com_codechat_app_failure_count', { count: failures })}
      </Button>
    </div>
  ) : null;
}
