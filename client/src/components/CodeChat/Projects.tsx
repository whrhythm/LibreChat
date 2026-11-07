import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { aiProjects, QueryKeys } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import Engineering from './Engineering';
import Assistants from './Assistants';

export default function Projects({ enabled, path, onOpen }: {
  enabled: boolean;
  path: string;
  onOpen: (pane: 'files' | 'apps', path: string) => void;
}) {
  const t = useLocalize();
  const { user, token } = useAuthContext();
  const state = useMemo(() => atom(false), []);
  const [engineering, setEngineering] = useAtom(state);
  const list = useQuery({
    queryKey: [QueryKeys.aiProjects, user?.id],
    queryFn: () => aiProjects(token!),
    enabled: enabled && !!token,
    retry: false,
  });
  return <div className="space-y-5">
    <Assistants enabled={enabled} onFiles={(folder) => onOpen('files', folder)} />
    <details className="border-border-light border-t pt-3" onToggle={(event) => setEngineering(event.currentTarget.open)}>
      <summary className="text-text-secondary cursor-pointer text-xs">{t('com_project_engineering')}</summary>
      <p className="text-text-secondary my-3 text-xs">{t('com_project_engineering_hint')}</p>
      {engineering && list.isSuccess && <Engineering enabled={enabled} path={path} onOpen={onOpen} exclude={list.data.projects.map((value) => value.project.id)} />}
      {engineering && list.isError && <p role="alert">{t('com_ai_projects_load_error')}</p>}
    </details>
  </div>;
}
