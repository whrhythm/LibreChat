import { HardDrive } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Progress } from '@librechat/client';
import { personalCapacityRequest, QueryKeys } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { storageSize } from './storage';

export default function StorageSummary() {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const account = useQuery({
    queryKey: [QueryKeys.codechatCapacity, user?.id],
    queryFn: () => personalCapacityRequest(token!, 'account'),
    enabled: !!user?.id && !!token,
    refetchInterval: 10000,
    retry: false,
  });
  const storage = account.data?.storage;
  const used = storage?.known_used_bytes;
  const limit = storage?.budget_bytes;
  const percent = used != null && limit && limit > 0 ? (used / limit) * 100 : null;
  const dates = storage?.components
    .map((item) => item.observed_at)
    .filter(Boolean)
    .sort();
  const observed = dates?.[0];
  const stale = account.isError || storage?.components.some((item) => item.status === 'stale');
  function tone(): 'default' | 'warning' | 'error' {
    if (percent != null && percent >= 100) return 'error';
    if (percent != null && percent >= 85) return 'warning';
    return 'default';
  }
  function freshness() {
    if (stale) return t('com_codechat_space_stale');
    if (account.isFetching) return t('com_codechat_space_refreshing');
    if (observed)
      return t('com_codechat_space_observed', { time: new Date(observed).toLocaleTimeString() });
    return t('com_codechat_space_measuring');
  }
  return (
    <section
      aria-label={t('com_codechat_space_usage')}
      className="bg-surface-secondary rounded-xl p-3"
    >
      <div className="text-text-secondary mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5">
          <HardDrive className="size-3.5" aria-hidden="true" />
          {t('com_codechat_space_usage')}
        </span>
        <span className="tabular-nums">{percent == null ? '—' : `${percent.toFixed(1)}%`}</span>
      </div>
      <p className="text-text-primary mb-2 text-sm font-semibold tabular-nums">
        {t(storage?.complete ? 'com_codechat_space_used' : 'com_codechat_space_partial', {
          used: used == null ? '—' : storageSize(used),
          limit: limit == null ? '—' : storageSize(limit),
        })}
      </p>
      <Progress
        aria-label={t('com_codechat_space_usage')}
        value={percent == null ? null : Math.min(100, percent)}
        variant={tone()}
      />
      <div className="text-text-secondary mt-2 flex flex-wrap items-center justify-between gap-1 text-xs">
        <span role="status">{freshness()}</span>
        {account.isError && (
          <Button variant="ghost" size="xs" onClick={() => void account.refetch()}>
            {t('com_codechat_retry')}
          </Button>
        )}
      </div>
      {percent != null && percent >= 85 && (
        <p className="text-text-primary mt-2 text-xs">{t('com_codechat_space_near_full')}</p>
      )}
    </section>
  );
}
