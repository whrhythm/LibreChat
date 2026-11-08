import { useMemo, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@librechat/client';
import { atom, useAtom, useAtomValue } from 'jotai';
import type { CapacityAccount } from 'librechat-data-provider';
import { activePanelAtom } from '~/Providers/ActivePanelContext';
import { storageSize } from './storage';
import { useLocalize } from '~/hooks';
import useAccount from './useAccount';
import Capacity from './Capacity';

export function usageRatios(data?: CapacityAccount) {
  const ratio = (used?: number | null, limit?: number | null) =>
    used != null && limit != null && limit > 0 ? Math.max(0, used / limit) : null;
  return {
    storage: ratio(data?.storage.known_used_bytes, data?.storage.budget_bytes),
    model:
      data?.wallet?.status === 'unknown'
        ? null
        : ratio(data?.wallet?.spent_usd_micros, data?.wallet?.allocated_usd_micros),
  };
}

function Rings({ data, className }: { data?: CapacityAccount; className?: string }) {
  const t = useLocalize();
  const values = usageRatios(data);
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label={t('com_assets_usage_rings')}
    >
      {(
        [
          ['storage', 16],
          ['model', 10],
        ] as const
      ).map(([key, radius]) => (
        <g key={key}>
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-border-light"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            pathLength="100"
            strokeDasharray={values[key] == null ? '3 7' : `${Math.min(1, values[key]) * 100} 100`}
            transform="rotate(-90 20 20)"
            className={key === 'storage' ? 'text-text-primary' : 'text-text-tertiary'}
          />
        </g>
      ))}
    </svg>
  );
}

export function UsageIcon({ className }: { className?: string }) {
  const account = useAccount();
  return <Rings data={account.data} className={className} />;
}

export function StorageDetails({ data }: { data?: CapacityAccount }) {
  const t = useLocalize();
  const labels = {
    files: 'com_assets_files',
    knowledge: 'com_assets_knowledge',
    images: 'com_assets_images',
    objects: 'com_assets_objects',
    database: 'com_assets_databases',
    app_volumes: 'com_assets_app_volumes',
    versions: 'com_assets_versions',
  } as const;
  return (
    <dl className="space-y-2 text-xs">
      {Object.entries(labels).map(([kind, label]) => {
        const readings = data?.storage.components.filter((v) => v.component === kind) ?? [];
        const measured = readings.filter((v) => v.used_bytes != null && v.status !== 'not_metered');
        const total = measured.reduce((sum, v) => sum + v.used_bytes!, 0);
        const complete =
          readings.length > 0 && readings.every((v) => v.used_bytes != null && v.status === 'ok');
        return (
          <div key={kind} className="flex justify-between gap-2">
            <dt>{t(label)}</dt>
            <dd className="text-right tabular-nums">
              {measured.length ? storageSize(total) : '—'}
              {!complete && (
                <span className="text-text-secondary ms-1">
                  {t('com_assets_measurement_partial')}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export default function UsagePanel() {
  const t = useLocalize();
  const active = useAtomValue(activePanelAtom) === 'resource-usage';
  const account = useAccount(active);
  const openAtom = useMemo(() => atom(false), []);
  const [open, setOpen] = useAtom(openAtom);
  const trigger = useRef<HTMLButtonElement>(null);
  const data = account.data;
  const money = (v?: number) => (v == null ? '—' : '$' + (v / 1000000).toFixed(2));
  return (
    <section className="h-full overflow-auto px-4 py-3 text-sm" aria-label={t('com_assets_usage')}>
      <header className="flex items-center justify-between">
        <h2 className="font-semibold">{t('com_assets_usage')}</h2>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('com_assets_refresh')}
          disabled={account.isFetching}
          onClick={() => void account.refetch()}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <Rings data={data} className="mx-auto my-5 size-24" />
      <dl className="space-y-3 text-xs">
        <div className="flex justify-between gap-2">
          <dt>{t('com_assets_outer_disk')}</dt>
          <dd>
            {data?.storage.known_used_bytes == null
              ? '—'
              : storageSize(data.storage.known_used_bytes)}{' '}
            / {data ? storageSize(data.storage.budget_bytes) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>{t('com_assets_inner_model')}</dt>
          <dd>
            {money(data?.wallet?.spent_usd_micros)} / {money(data?.wallet?.allocated_usd_micros)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>{t('com_assets_tokens')}</dt>
          <dd>{data?.wallet?.total_tokens?.toLocaleString() ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>{t('com_assets_deployments')}</dt>
          <dd>
            {data?.applications.used ?? '—'} / {data?.applications.limit ?? '—'}
          </dd>
        </div>
      </dl>
      <p className="text-text-secondary my-3 text-xs" role={account.isError ? 'alert' : 'status'}>
        {account.isError ? t('com_codechat_space_stale') : t('com_assets_account_scope')}
      </p>
      {(!data?.storage.complete || data?.wallet?.status !== 'ok') && (
        <p className="text-text-secondary mb-3 text-xs">{t('com_codechat_space_partial_status')}</p>
      )}
      {data?.wallet?.observed_at && (
        <p className="text-text-secondary mb-3 text-xs">
          {t('com_assets_model_observed', {
            time: new Date(data.wallet.observed_at).toLocaleString(),
          })}
        </p>
      )}
      <details className="border-border-light border-t py-3">
        <summary className="cursor-pointer text-xs">{t('com_assets_storage_details')}</summary>
        <div className="pt-3">
          <StorageDetails data={data} />
        </div>
      </details>
      <Button ref={trigger} variant="outline" className="w-full" onClick={() => setOpen(true)}>
        {t('com_codechat_capacity_title')}
      </Button>
      <Capacity expanded={active} visible={open} onVisibleChange={setOpen} returnFocus={trigger} />
    </section>
  );
}
