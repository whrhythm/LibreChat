import { useEffect, useMemo, useRef } from 'react';
import { Coins } from 'lucide-react';
import { atom, useAtom } from 'jotai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import {
  personalCapacityRequest,
  retryPersonalObjectStorage,
  QueryKeys,
  CapacityError,
} from 'librechat-data-provider';
import type { CapacityPlan } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { storageSize } from './storage';
import Membership from './Membership';

const statusKeys = {
  pending_payment: 'com_codechat_capacity_pending',
  applying: 'com_codechat_capacity_applying',
  ready: 'com_codechat_capacity_ready',
  failed: 'com_codechat_capacity_failed',
  cancelled: 'com_codechat_capacity_cancelled',
} as const;
const componentKeys = {
  files: 'com_codechat_capacity_files',
  database: 'com_codechat_capacity_database',
  objects: 'com_codechat_capacity_objects',
  images: 'com_codechat_capacity_images',
  app_volumes: 'com_codechat_capacity_volumes',
} as const;
const objectStatusKeys = {
  not_prepared: 'com_codechat_objects_preparing',
  preparing: 'com_codechat_objects_preparing',
  ready: 'com_codechat_objects_ready',
  failed: 'com_codechat_objects_failed',
  requires_review: 'com_codechat_objects_review',
} as const;

export default function Capacity({ expanded }: { expanded: boolean }) {
  const { user, token } = useAuthContext();
  const { data: startup } = useGetStartupConfig();
  const localize = useLocalize();
  const client = useQueryClient();
  const openAtom = useMemo(() => atom(false), []);
  const [open, setOpen] = useAtom(openAtom);
  const trigger = useRef<HTMLButtonElement>(null);
  const keys = useRef(new Map<string, string>());
  const enabled = startup?.codechat?.capacity?.enabled === true;
  const accountingEnabled = startup?.codechat?.storageAccounting?.enabled === true;
  const account = useQuery({
    queryKey: [QueryKeys.codechatCapacity, user?.id],
    queryFn: () => personalCapacityRequest(token!, 'account'),
    enabled: enabled && !!user?.id && !!token && (expanded || open),
    refetchInterval: expanded || open ? 5000 : false,
    retry: false,
  });
  const observedAllowance = useRef<{ storage: number; applications: number } | null>(null);
  const objectRetry = useMutation({
    mutationFn: () => retryPersonalObjectStorage(token!),
    onSuccess: () => client.invalidateQueries([QueryKeys.codechatCapacity, user?.id]),
  });
  const storage = account.data?.plan.storage_gib;
  const applications = account.data?.plan.application_limit;
  useEffect(() => {
    if (storage == null || applications == null) return;
    const previous = observedAllowance.current;
    observedAllowance.current = { storage, applications };
    if (!previous || (previous.storage === storage && previous.applications === applications))
      return;
    // Opening completes after the payment request; refresh the related displays
    // when observed rights change instead of waiting for their polling timers.
    void Promise.all(
      [QueryKeys.codechatUsage, QueryKeys.codechatSpace, QueryKeys.codechatApps].map((key) =>
        client.invalidateQueries([key, user?.id]),
      ),
    );
  }, [storage, applications, client, user?.id]);
  const operation = useMutation({
    mutationFn: ({
      action,
      plan,
      orderId,
    }: {
      action: 'order' | 'confirm-test' | 'cancel' | 'retry';
      plan?: CapacityPlan;
      orderId?: string;
    }) => {
      let key: string | undefined;
      if (plan) {
        const selection = `${plan.id}:${plan.version}`;
        key = keys.current.get(selection);
        if (!key) {
          key = crypto.randomUUID();
          keys.current.set(selection, key);
        }
      }
      return personalCapacityRequest(token!, action, { plan, orderId, idempotencyKey: key });
    },
    onSuccess: async (order) => {
      if (order.status === 'cancelled') keys.current.clear();
      await Promise.all(
        [
          QueryKeys.codechatCapacity,
          QueryKeys.codechatUsage,
          QueryKeys.codechatSpace,
          QueryKeys.codechatApps,
        ].map((key) => client.invalidateQueries([key, user?.id])),
      );
    },
    onError: () => void client.invalidateQueries([QueryKeys.codechatCapacity, user?.id]),
    retry: false,
  });
  useEffect(() => {
    const latest = account.data?.orders[0];
    if (
      latest &&
      (latest.status === 'ready' || latest.status === 'cancelled') &&
      !account.data?.active_order
    ) {
      keys.current.clear();
    }
  }, [account.data]);
  useEffect(() => {
    keys.current.clear();
  }, [user?.id]);
  if (!enabled) return null;
  const data = account.data;
  const order = data?.active_order ?? data?.orders[0];
  const requiresReview = order?.error_code?.includes('requires_review') === true;
  const changed =
    operation.error instanceof CapacityError && operation.error.code === 'capacity_plan_changed';
  function price(plan: CapacityPlan) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.currency }).format(
      plan.amount_minor / 100,
    );
  }
  return (
    <>
      <Button ref={trigger} variant="ghost" onClick={() => setOpen(true)}>
        <Coins className="mr-2 h-4 w-4" aria-hidden="true" />
        {localize('com_codechat_capacity_title')}
      </Button>
      {open && (
        <OGDialog open onOpenChange={setOpen} triggerRef={trigger}>
          <OGDialogContent className="max-w-5xl">
            <OGDialogTitle>{localize('com_codechat_capacity_title')}</OGDialogTitle>
            <OGDialogDescription>
              {localize('com_codechat_capacity_description')}
            </OGDialogDescription>
            <div className="flex max-h-[75vh] flex-col gap-6 overflow-auto">
              {account.isLoading && <p role="status">{localize('com_ui_loading')}</p>}
              {account.isError && (
                <div role="alert">
                  <p>{localize('com_codechat_capacity_error')}</p>
                  <Button variant="outline" onClick={() => void account.refetch()}>
                    {localize('com_codechat_retry')}
                  </Button>
                </div>
              )}
              {data && (
                <>
                  <Membership
                    account={data}
                    busy={operation.isLoading || !!data.active_order}
                    choose={(plan) => operation.mutate({ action: 'order', plan })}
                  />
                  {order && (
                    <section
                      className="border-border-light rounded-2xl border p-5"
                      aria-label={localize('com_codechat_capacity_order')}
                    >
                      <h3 className="font-semibold">
                        {localize('com_codechat_capacity_order')}
                        {': '}
                        {order.plan.name}
                      </h3>
                      <p className="text-text-secondary mt-2 text-sm">
                        {localize('com_codechat_capacity_target', {
                          capacity: order.plan.storage_gib,
                          count: order.plan.application_limit,
                          price: price(order.plan),
                        })}
                      </p>
                      {!!order.plan.model_credit_usd_micros && (
                        <p className="mt-2 text-sm">
                          {localize(
                            order.model_credit_status === 'applied'
                              ? 'com_codechat_member_credit_applied'
                              : 'com_codechat_member_credit_pending',
                          )}
                        </p>
                      )}
                      <p role="status" className="mt-3">
                        {localize(statusKeys[order.status])}
                      </p>
                      {order.status === 'applying' && (
                        <p className="text-text-secondary mt-2 text-sm">
                          {localize('com_codechat_capacity_wait')}
                        </p>
                      )}
                      {order.status === 'failed' && (
                        <p role="alert" className="mt-2 text-sm">
                          {localize(
                            requiresReview
                              ? 'com_codechat_capacity_review'
                              : 'com_codechat_capacity_failure_detail',
                          )}
                        </p>
                      )}
                      {data.mode === 'test' && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {order.status === 'pending_payment' && (
                            <>
                              <Button
                                disabled={operation.isLoading}
                                onClick={() =>
                                  operation.mutate({ action: 'confirm-test', orderId: order.id })
                                }
                              >
                                {localize('com_codechat_capacity_confirm')}
                              </Button>
                              <Button
                                variant="outline"
                                disabled={operation.isLoading}
                                onClick={() =>
                                  operation.mutate({ action: 'cancel', orderId: order.id })
                                }
                              >
                                {localize('com_ui_cancel')}
                              </Button>
                            </>
                          )}
                          {order.status === 'failed' && !requiresReview && (
                            <Button
                              variant="outline"
                              disabled={operation.isLoading}
                              onClick={() =>
                                operation.mutate({ action: 'retry', orderId: order.id })
                              }
                            >
                              {localize('com_codechat_capacity_retry')}
                            </Button>
                          )}
                        </div>
                      )}
                    </section>
                  )}
                  <details className="border-border-light rounded-2xl border p-5">
                    <summary className="cursor-pointer font-medium">
                      {localize('com_codechat_member_storage_details')}
                    </summary>
                    <section
                      className="mt-4 space-y-3"
                      aria-label={localize('com_codechat_capacity_current')}
                    >
                      <p>
                        {localize('com_codechat_capacity_rights', {
                          capacity: data.plan.storage_gib,
                          count: data.applications.limit,
                        })}
                      </p>
                      <p>
                        {localize('com_codechat_capacity_apps', {
                          used: data.applications.used,
                          count: data.applications.limit,
                        })}
                      </p>
                      {accountingEnabled && (
                        <>
                          <p>
                            {localize(
                              data.storage.complete
                                ? 'com_codechat_storage_total'
                                : 'com_codechat_storage_subtotal',
                              {
                                used:
                                  data.storage.known_used_bytes === null
                                    ? localize('com_codechat_capacity_unmetered')
                                    : storageSize(data.storage.known_used_bytes),
                              },
                            )}
                          </p>
                          <p className="text-text-secondary text-sm">
                            {localize('com_codechat_storage_scope')}
                          </p>
                        </>
                      )}
                      {!data.storage.complete && <p>{localize('com_codechat_capacity_partial')}</p>}
                      <ul className="space-y-2 text-sm">
                        {data.storage.components.map((component) => (
                          <li key={component.component}>
                            {localize(componentKeys[component.component])}
                            {': '}
                            {component.used_bytes == null
                              ? localize('com_codechat_capacity_unmetered')
                              : storageSize(component.used_bytes)}
                            {component.status === 'stale' &&
                              ' · ' + localize('com_codechat_capacity_stale')}
                            {accountingEnabled &&
                              component.budget_bytes !== null &&
                              component.basis !== 'no_additional_pvc' &&
                              ' · ' +
                                localize('com_codechat_storage_limit', {
                                  capacity: storageSize(component.budget_bytes),
                                })}
                            {accountingEnabled &&
                              component.status === 'ok' &&
                              component.basis === 'harbor_project_quota' &&
                              component.budget_bytes === null &&
                              ' · ' + localize('com_codechat_storage_unlimited')}
                            {component.observed_at && (
                              <time
                                className="text-text-secondary ml-2"
                                dateTime={component.observed_at}
                              >
                                {new Date(component.observed_at).toLocaleTimeString()}
                              </time>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </details>
                  {accountingEnabled && data.object_storage?.enabled && (
                    <section
                      className="text-text-secondary text-sm"
                      aria-label={localize('com_codechat_objects_title')}
                    >
                      <p role="status">{localize(objectStatusKeys[data.object_storage.status])}</p>
                      {data.object_storage.status === 'failed' && (
                        <Button
                          variant="outline"
                          disabled={objectRetry.isLoading}
                          onClick={() => objectRetry.mutate()}
                        >
                          {localize('com_codechat_retry')}
                        </Button>
                      )}
                      {objectRetry.isError && (
                        <p role="alert">{localize('com_codechat_objects_failed')}</p>
                      )}
                    </section>
                  )}
                  {data.mode === 'disabled' && <p>{localize('com_codechat_capacity_disabled')}</p>}
                </>
              )}
              {operation.isError && (
                <p role="alert">
                  {localize(
                    changed ? 'com_codechat_capacity_changed' : 'com_codechat_capacity_error',
                  )}
                </p>
              )}
              <p className="text-text-secondary text-xs leading-relaxed">
                {localize('com_codechat_capacity_test_only')}
              </p>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {localize('com_ui_close')}
              </Button>
            </div>
          </OGDialogContent>
        </OGDialog>
      )}
    </>
  );
}
