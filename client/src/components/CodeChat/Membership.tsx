import { Button } from '@librechat/client';
import { Check, Coins, HardDrive, Boxes } from 'lucide-react';
import type { CapacityAccount, CapacityPlan } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import i18n from '~/locales/i18n';

function count(value?: number | null) {
  return value == null
    ? '—'
    : new Intl.NumberFormat(i18n.language || undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);
}

export default function Membership({
  account,
  busy,
  choose,
}: {
  account: CapacityAccount;
  busy: boolean;
  choose: (plan: CapacityPlan) => void;
}) {
  const t = useLocalize();
  const wallet = account.wallet;
  const remaining = wallet?.remaining_usd_micros;
  const price = (amount: number, currency = 'CNY') =>
    new Intl.NumberFormat(i18n.language || undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  const current =
    account.plan.id === 'existing'
      ? t('com_codechat_member_trial')
      : (account.plans.find((plan) => plan.id === account.plan.id)?.name ?? account.plan.name);
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3" aria-label={t('com_codechat_member_overview')}>
        <article className="border-border-light bg-surface-secondary rounded-2xl border p-5">
          <p className="text-text-secondary flex items-center gap-2 text-sm">
            <Coins className="size-4" aria-hidden="true" />
            {t('com_codechat_member_balance')}
          </p>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {wallet?.remaining_cny_minor == null ? '—' : price(wallet.remaining_cny_minor / 100)}
          </p>
          <p className="text-text-secondary mt-2 text-xs">
            {remaining == null
              ? t('com_codechat_member_balance_loading')
              : t('com_codechat_member_usd_balance', { amount: price(remaining / 1000000, 'USD') })}
          </p>
          <p className="mt-3 text-sm">
            {t('com_codechat_member_tokens_used', { total: count(wallet?.total_tokens) })}
          </p>
          <p className="text-text-secondary mt-1 text-xs">
            {t('com_codechat_member_tokens_split', {
              input: count(wallet?.prompt_tokens),
              output: count(wallet?.completion_tokens),
            })}
          </p>
          {wallet?.status === 'stale' && (
            <p role="status" className="mt-2 text-xs">
              {t('com_codechat_capacity_stale')}
            </p>
          )}
          {remaining === 0 && (
            <p role="alert" className="mt-2 text-sm">
              {t('com_codechat_member_exhausted')}
            </p>
          )}
        </article>
        <article className="border-border-light rounded-2xl border p-5">
          <p className="text-text-secondary flex items-center gap-2 text-sm">
            <HardDrive className="size-4" aria-hidden="true" />
            {t('com_codechat_member_disk')}
          </p>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {account.plan.storage_gib}
            <span className="ml-1 text-base font-normal">{t('com_codechat_member_disk_unit')}</span>
          </p>
          <p className="text-text-secondary mt-3 text-sm">
            {t('com_codechat_member_personal_files')}
          </p>
          <p className="mt-2 text-sm">{t('com_codechat_member_current', { name: current })}</p>
        </article>
        <article className="border-border-light rounded-2xl border p-5">
          <p className="text-text-secondary flex items-center gap-2 text-sm">
            <Boxes className="size-4" aria-hidden="true" />
            {t('com_codechat_member_apps')}
          </p>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {account.applications.used}
            <span className="text-text-secondary ml-1 text-base font-normal">
              / {account.applications.limit}
            </span>
          </p>
          <p className="text-text-secondary mt-3 text-sm">{t('com_codechat_member_apps_help')}</p>
        </article>
      </section>
      {wallet?.estimated_tokens != null && (
        <p className="text-text-secondary text-sm">
          {t('com_codechat_member_remaining_tokens', {
            total: count(wallet.estimated_tokens),
            model: wallet.reference_model ?? '',
          })}
        </p>
      )}
      <section aria-label={t('com_codechat_capacity_plans')}>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">{t('com_codechat_member_pick')}</h3>
          <p className="text-text-secondary mt-1 text-sm">{t('com_codechat_member_pick_help')}</p>
        </div>
        <div className="grid items-stretch gap-4 md:grid-cols-3">
          {account.trial && (
            <article className="border-border-light flex flex-col rounded-2xl border p-5">
              <h4 className="text-lg font-semibold">{t('com_codechat_member_trial')}</h4>
              <p className="text-text-secondary mt-1 min-h-10 text-sm">
                {t('com_codechat_member_trial_description')}
              </p>
              <p className="my-5 text-3xl font-semibold">
                {price(0)}
                <span className="text-text-secondary ml-1 text-sm font-normal">
                  {t('com_codechat_member_once')}
                </span>
              </p>
              <p className="font-medium">
                {account.trial.estimated_tokens == null
                  ? t('com_codechat_member_by_model')
                  : t('com_codechat_member_token_estimate', {
                      total: count(account.trial.estimated_tokens),
                    })}
              </p>
              <ul className="my-5 flex-1 space-y-3 text-sm">
                {[
                  t('com_codechat_member_gift'),
                  t('com_codechat_member_plan_disk', { count: account.trial.storage_gib }),
                  t('com_codechat_member_plan_apps', { count: account.trial.application_limit }),
                  t('com_codechat_member_shared_balance'),
                ].map((text) => (
                  <li key={text} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
              <Button variant="outline" disabled>
                {t('com_codechat_member_trial_received')}
              </Button>
            </article>
          )}
          {account.plans.map((plan) => {
            const active = plan.id === account.plan.id;
            return (
              <article
                key={plan.id}
                className={
                  active
                    ? 'border-border-heavy bg-surface-secondary flex flex-col rounded-2xl border p-5'
                    : 'border-border-light flex flex-col rounded-2xl border p-5'
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-lg font-semibold">{plan.name}</h4>
                  {active && (
                    <span className="border-border-heavy rounded-full border px-2 py-1 text-xs">
                      {t('com_codechat_member_active')}
                    </span>
                  )}
                </div>
                <p className="text-text-secondary mt-1 min-h-10 text-sm">
                  {plan.description || t('com_codechat_member_plan_description')}
                </p>
                <p className="my-5 text-3xl font-semibold">
                  {price(plan.amount_minor / 100, plan.currency)}
                  <span className="text-text-secondary ml-1 text-sm font-normal">
                    {t('com_codechat_member_once')}
                  </span>
                </p>
                <p className="font-medium">
                  {plan.estimated_tokens == null
                    ? t('com_codechat_member_by_model')
                    : t('com_codechat_member_token_estimate', {
                        total: count(plan.estimated_tokens),
                      })}
                </p>
                <ul className="my-5 flex-1 space-y-3 text-sm">
                  {[
                    t('com_codechat_member_plan_credit', {
                      amount: price((plan.model_credit_cny_minor ?? 0) / 100),
                      usd: price((plan.model_credit_usd_micros ?? 0) / 1000000, 'USD'),
                    }),
                    t('com_codechat_member_plan_disk', { count: plan.storage_gib }),
                    t('com_codechat_member_plan_apps', { count: plan.application_limit }),
                    t('com_codechat_member_shared_balance'),
                    ...(plan.features ?? []),
                  ].map((text, index) => (
                    <li key={index} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={active ? 'default' : 'outline'}
                  disabled={busy}
                  onClick={() => choose(plan)}
                >
                  {t('com_codechat_capacity_choose', { name: plan.name })}
                </Button>
              </article>
            );
          })}
        </div>
        <p className="text-text-secondary mt-4 text-xs leading-relaxed">
          {t('com_codechat_member_estimate_note')}
        </p>
        {account.plans.length === 0 && <p>{t('com_codechat_capacity_no_plans')}</p>}
      </section>
    </>
  );
}
