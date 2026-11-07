import { Progress } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import { personalCapacityRequest, QueryKeys } from 'librechat-data-provider';
import { isCodeChatEnabled } from '~/components/CodeChat/config';
import { storageSize } from '~/components/CodeChat/storage';
import { useAuthContext, useLocalize } from '~/hooks';

export default function ProjectUsage({ compact = false }: { compact?: boolean }) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const account = useQuery({
    queryKey: [QueryKeys.codechatCapacity, user?.id],
    queryFn: () => personalCapacityRequest(token!, 'account'),
    enabled: !!user?.id && !!token && isCodeChatEnabled(),
    retry: false,
    refetchInterval: 30000,
  });
  if (!isCodeChatEnabled()) return null;
  const data = account.data;
  const wallet = data?.wallet;
  const money = (v?: number) => (v == null ? '—' : '$' + (v / 1e6).toFixed(2));
  const rows = [
    {
      label: t('com_codechat_space_usage'),
      used: data?.storage.known_used_bytes,
      limit: data?.storage.budget_bytes,
      text: `${data?.storage.known_used_bytes == null ? '—' : storageSize(data.storage.known_used_bytes)} / ${data ? storageSize(data.storage.budget_bytes) : '—'}`,
      incomplete: !data?.storage.complete || data.storage.components.some((c) => c.status !== 'ok'),
    },
    {
      label: t('com_project_model_usage'),
      used: wallet?.spent_usd_micros,
      limit: wallet?.allocated_usd_micros,
      text: `${money(wallet?.spent_usd_micros)} / ${money(wallet?.allocated_usd_micros)}`,
      incomplete: wallet?.status !== 'ok',
      detail: t('com_codechat_member_tokens_used', {
        total: wallet?.total_tokens == null ? '—' : wallet.total_tokens.toLocaleString(),
      }),
    },
    {
      label: t('com_project_application_usage'),
      used: data?.applications.used,
      limit: data?.applications.limit,
      text: `${data?.applications.used ?? '—'} / ${data?.applications.limit ?? '—'}`,
      incomplete: !data,
    },
  ];
  return (
    <section
      aria-label={t('com_project_account_usage')}
      className={
        compact
          ? 'border-border-light border-b px-3 py-3'
          : 'border-border-light border-b px-4 py-3 md:px-6'
      }
    >
      <div className="text-text-secondary mb-2 text-xs">
        {t('com_project_account_usage')}
        {account.isError ? ' · ' + t('com_codechat_space_stale') : ''}
      </div>
      <div
        className={compact ? 'grid grid-cols-1 gap-2.5' : 'grid grid-cols-1 gap-3 sm:grid-cols-3'}
      >
        {rows.map((row) => {
          const percent =
            row.used != null && row.limit != null && row.limit > 0
              ? (row.used / row.limit) * 100
              : null;
          return (
            <div key={row.label} className="min-w-0 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <span>{row.label}</span>
                <span className="tabular-nums">{row.text}</span>
              </div>
              <Progress
                aria-label={row.label}
                value={percent == null ? null : Math.min(100, percent)}
                variant={percent != null && percent >= 100 ? 'error' : 'default'}
              />
              <div className="text-text-secondary flex flex-wrap justify-between gap-1">
                <span>{row.detail ?? (percent == null ? '—' : percent.toFixed(1) + '%')}</span>
                {row.incomplete && <span>{t('com_codechat_space_partial_status')}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
