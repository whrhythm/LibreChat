import { useEffect, useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { HardDrive } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { personalCapacityRequest, QueryKeys, CapacityError } from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import type { CapacityPlan } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { storageSize } from './storage';

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
  const account = useQuery({
    queryKey: [QueryKeys.codechatCapacity, user?.id],
    queryFn: () => personalCapacityRequest(token!, 'account'),
    enabled: enabled && !!user?.id && !!token && (expanded || open),
    refetchInterval: expanded || open ? 5000 : false,
    retry: false,
  });
  const observedAllowance = useRef<{ storage: number; applications: number } | null>(null);
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
        <HardDrive className="mr-2 h-4 w-4" aria-hidden="true" />
        {localize('com_codechat_capacity_title')}
      </Button>
      {open && (
        <OGDialog open onOpenChange={setOpen} triggerRef={trigger}>
          <OGDialogContent className="max-w-2xl">
            <OGDialogTitle>{localize('com_codechat_capacity_title')}</OGDialogTitle>
            <OGDialogDescription>
              {localize('com_codechat_capacity_description')}
            </OGDialogDescription>
            <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto">
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
                  <section
                    aria-label={localize('com_codechat_capacity_current')}
                    className="flex flex-col gap-1"
                  >
                    <h3>
                      {localize('com_codechat_capacity_current')}
                      {': '}
                      {data.plan.id === 'existing'
                        ? localize('com_codechat_capacity_existing')
                        : data.plan.name}
                    </h3>
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
                    <p>{localize('com_codechat_capacity_partial')}</p>
                    <ul className="flex flex-col gap-1 text-sm">
                      {data.storage.components.map((component) => (
                        <li key={component.component}>
                          {localize(componentKeys[component.component])}
                          {': '}
                          {component.used_bytes == null
                            ? localize('com_codechat_capacity_unmetered')
                            : storageSize(component.used_bytes)}
                          {component.status === 'stale' &&
                            ` · ${localize('com_codechat_capacity_stale')}`}
                          {component.observed_at && (
                            <time className="ml-2" dateTime={component.observed_at}>
                              {new Date(component.observed_at).toLocaleTimeString()}
                            </time>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                  {order && (
                    <section
                      aria-label={localize('com_codechat_capacity_order')}
                      className="border-border-light flex flex-col gap-2 rounded border p-3"
                    >
                      <h3>
                        {localize('com_codechat_capacity_order')}
                        {': '}
                        {order.plan.name}
                      </h3>
                      <p>
                        {localize('com_codechat_capacity_target', {
                          capacity: order.plan.storage_gib,
                          count: order.plan.application_limit,
                          price: price(order.plan),
                        })}
                      </p>
                      <p role="status">{localize(statusKeys[order.status])}</p>
                      {order.status === 'applying' && (
                        <p>{localize('com_codechat_capacity_wait')}</p>
                      )}
                      {order.status === 'failed' && (
                        <p role="alert">
                          {localize(
                            requiresReview
                              ? 'com_codechat_capacity_review'
                              : 'com_codechat_capacity_failure_detail',
                          )}
                        </p>
                      )}
                      {data.mode === 'test' && (
                        <div className="flex flex-wrap gap-2">
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
                  {data.mode === 'test' && !data.active_order && (
                    <section
                      aria-label={localize('com_codechat_capacity_plans')}
                      className="flex flex-col gap-2"
                    >
                      <h3>{localize('com_codechat_capacity_plans')}</h3>
                      {data.plans.map((plan) => (
                        <article
                          key={`${plan.id}:${plan.version}`}
                          className="border-border-light flex flex-col gap-2 rounded border p-3"
                        >
                          <h4>{plan.name}</h4>
                          <p>
                            {localize('com_codechat_capacity_target', {
                              capacity: plan.storage_gib,
                              count: plan.application_limit,
                              price: price(plan),
                            })}
                          </p>
                          <Button
                            variant="outline"
                            disabled={operation.isLoading}
                            onClick={() => operation.mutate({ action: 'order', plan })}
                          >
                            {localize('com_codechat_capacity_choose', { name: plan.name })}
                          </Button>
                        </article>
                      ))}
                      {data.plans.length === 0 && (
                        <p>{localize('com_codechat_capacity_no_plans')}</p>
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
              <p className="text-text-secondary text-sm">
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
