import { Button } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import { generatedToolCatalog, QueryKeys } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

type Props = {
  search: string;
  fallback?: ReactNode;
  projectId?: string;
  selected?: string | null;
  available?: ReadonlySet<string>;
  onSelect?: (reference: string) => void;
};

export default function ProjectToolCatalog(props: Props) {
  const { user, token } = useAuthContext();
  const { data: startup } = useGetStartupConfig();
  if (!token || !user?.id || !startup?.aiTrialsEnabled) return <>{props.fallback}</>;
  return <Catalog {...props} token={token} userId={user.id} />;
}

function Catalog({
  search,
  fallback,
  projectId,
  selected,
  available,
  onSelect,
  token,
  userId,
}: Props & { token: string; userId: string }) {
  const t = useLocalize();
  const query = useQuery({
    queryKey: [QueryKeys.generatedToolCatalog, userId],
    queryFn: () => generatedToolCatalog(token),
    retry: false,
  });
  if (query.isLoading)
    return (
      <p role="status" className="py-3 text-sm">
        {t('com_ui_loading')}
      </p>
    );
  if (query.isError) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm" role="alert">
        {t('com_project_tool_catalog_failed')}
        <Button type="button" size="xs" variant="outline" onClick={() => void query.refetch()}>
          {t('com_ui_retry')}
        </Button>
      </div>
    );
  }
  const text = search.trim().toLowerCase();
  const tools = (query.data?.tools ?? []).filter((item) =>
    [item.title, item.project_name, item.reference ?? ''].some((value) =>
      value.toLowerCase().includes(text),
    ),
  );
  if (!tools.length) return <>{fallback}</>;
  return (
    <section aria-label={t('com_project_tool_catalog_title')} className="space-y-2">
      <h3 className="text-sm font-semibold">{t('com_project_tool_catalog_title')}</h3>
      <ul className={projectId ? 'grid gap-2' : 'grid gap-2 sm:grid-cols-2 xl:grid-cols-3'}>
        {tools.map((item) => {
          const reference = item.reference;
          const version = reference?.split(':').at(-1);
          const enabled =
            !!reference &&
            !!onSelect &&
            item.project_id === projectId &&
            item.state === 'approved' &&
            available?.has(reference);
          const active = !!reference && selected === reference;
          return (
            <li key={item.id} className="border-border-light space-y-2 rounded-xl border p-3">
              <h4 className="text-text-primary text-sm font-semibold break-words">{item.title}</h4>
              <dl className="text-text-secondary space-y-1 text-xs">
                <div className="flex gap-2">
                  <dt className="shrink-0">{t('com_ui_project')}</dt>
                  <dd className="min-w-0 break-words">{item.project_name}</dd>
                </div>
                <div className="flex gap-2">
                  <dt>{t('com_ui_agent_version')}</dt>
                  <dd title={version}>{version ? <code>{version.slice(0, 12)}</code> : '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt>{t('com_project_tool_catalog_review')}</dt>
                  <dd>
                    {t(
                      item.state === 'unsubmitted'
                        ? 'com_project_tool_catalog_unsubmitted'
                        : `com_releases_tool_${item.state}`,
                    )}
                  </dd>
                </div>
              </dl>
              {enabled ? (
                <Button
                  type="button"
                  size="xs"
                  variant={active ? 'outline' : 'default'}
                  aria-pressed={active}
                  onClick={() => onSelect(reference)}
                >
                  {t(active ? 'com_project_tool_catalog_remove' : 'com_ui_select')}
                </Button>
              ) : (
                <p className="text-text-secondary text-xs">
                  {t(
                    item.project_id === projectId
                      ? 'com_project_tool_catalog_unavailable'
                      : 'com_project_tool_catalog_scoped',
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
