import { Button } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, programmingMCP } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

export default function MCP({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useLocalize();
  const { token, user } = useAuthContext();
  const query = useQuery({
    queryKey: [QueryKeys.programmingMCP, user?.id],
    queryFn: () => programmingMCP(token!),
    enabled: !!token,
    retry: 1,
    staleTime: 15000,
  });
  return (
    <fieldset className="border-border-light space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{t('com_codechat_mcp_title')}</legend>
      <p className="text-text-secondary text-xs">{t('com_codechat_mcp_description')}</p>
      {query.isLoading && (
        <p role="status" className="text-xs">
          {t('com_ui_loading')}
        </p>
      )}
      {query.isError && (
        <p role="alert" className="text-xs">
          {t('com_codechat_mcp_error')}{' '}
          <Button size="xs" variant="ghost" onClick={() => void query.refetch()}>
            {t('com_codechat_retry')}
          </Button>
        </p>
      )}
      {query.data?.servers.length === 0 && <p className="text-xs">{t('com_codechat_mcp_empty')}</p>}
      {query.data?.servers.map((server) => (
        <div key={server.id} className="space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.includes(server.id)}
              disabled={!server.enabled && !selected.includes(server.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, server.id]
                    : selected.filter((id) => id !== server.id),
                )
              }
            />
            <span>
              <span className="font-medium">{server.name}</span>
              <span className="text-text-secondary ml-2 text-xs">
                {t(server.enabled ? 'com_codechat_mcp_readonly' : 'com_codechat_mcp_disabled')}
              </span>
            </span>
          </label>
          <p className="text-text-secondary text-xs">{server.description}</p>
          <details className="text-xs">
            <summary className="cursor-pointer">{t('com_codechat_mcp_permissions')}</summary>
            <div className="mt-2 space-y-2">
              <p>{server.data_notice}</p>
              <p className="font-mono break-all">{server.url}</p>
              <p className="font-mono break-all">{server.tools.join(' · ')}</p>
            </div>
          </details>
        </div>
      ))}
    </fieldset>
  );
}
