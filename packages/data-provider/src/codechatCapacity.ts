import { z } from 'zod';

export const capacityOrderInputSchema = z
  .object({
    plan_id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    plan_version: z.string().regex(/^[a-zA-Z0-9._-]{1,40}$/),
  })
  .strict();

export type CapacityPlan = {
  id: string;
  version: string;
  name: string;
  storage_gib: number;
  application_limit: number;
  amount_minor: number;
  currency: string;
  model_credit_cny_minor?: number;
  model_credit_usd_micros?: number;
  settlement_cny_per_usd?: string | null;
  description?: string;
  features?: string[];
  estimated_tokens?: number | null;
  reference_model?: string | null;
};
export type CapacityOrder = {
  id: string;
  plan: CapacityPlan;
  status: 'pending_payment' | 'applying' | 'ready' | 'failed' | 'cancelled';
  payment_status: 'unpaid' | 'confirmed';
  stage: string;
  error_code: string | null;
  attempt: number;
  created_at: string;
  model_credit_status?: string;
};
export type CapacityAccount = {
  plan: CapacityPlan;
  mode: 'test' | 'disabled';
  plans: CapacityPlan[];
  active_order: CapacityOrder | null;
  orders: CapacityOrder[];
  applications: { used: number; limit: number };
  storage: {
    budget_bytes: number;
    pending_capacity_bytes: number;
    known_used_bytes: number | null;
    complete: boolean;
    budget_complete?: boolean;
    scope?: 'managed_logical_storage';
    components: {
      component: 'files' | 'database' | 'objects' | 'images' | 'app_volumes';
      budget_bytes: number | null;
      used_bytes: number | null;
      observed_at: string | null;
      status: 'ok' | 'stale' | 'unknown' | 'not_metered';
      basis?: string | null;
      scope_id?: string | null;
    }[];
  };
  object_storage?: ObjectStorageState | null;
  trial?: {
    storage_gib: number;
    application_limit: number;
    estimated_tokens: number | null;
    reference_model: string | null;
  };
  wallet?: {
    status: 'ok' | 'unknown' | 'stale';
    allocated_usd_micros?: number;
    spent_usd_micros?: number;
    remaining_usd_micros?: number | null;
    remaining_cny_minor?: number;
    total_tokens?: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    estimated_tokens?: number | null;
    reference_model?: string | null;
    observed_at?: string | null;
  } | null;
};

export type ObjectStorageState = {
  enabled: boolean;
  status: 'not_prepared' | 'preparing' | 'ready' | 'failed' | 'requires_review';
  bucket: string | null;
  budget_bytes: number | null;
  error_code: string | null;
};

export async function retryPersonalObjectStorage(token: string): Promise<ObjectStorageState> {
  const response = await fetch('/api/user/workspace/object-storage/retry', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new CapacityError('object_storage_unavailable');
  return response.json();
}

export class CapacityError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

type CapacityOptions = {
  orderId?: string;
  plan?: Pick<CapacityPlan, 'id' | 'version'>;
  idempotencyKey?: string;
};
type CapacityAction = 'account' | 'order' | 'confirm-test' | 'cancel' | 'retry';
export function personalCapacityRequest(token: string, action: 'account'): Promise<CapacityAccount>;
export function personalCapacityRequest(
  token: string,
  action: Exclude<CapacityAction, 'account'>,
  options?: CapacityOptions,
): Promise<CapacityOrder>;
export async function personalCapacityRequest(
  token: string,
  action: CapacityAction,
  options: CapacityOptions = {},
): Promise<CapacityAccount | CapacityOrder> {
  let suffix = '';
  if (action === 'order') suffix = '/orders';
  else if (action !== 'account')
    suffix = `/orders/${encodeURIComponent(options.orderId ?? '')}/${action}`;
  const response = await fetch(`/api/user/workspace/capacity${suffix}`, {
    method: action === 'account' ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(action === 'order'
        ? { 'Content-Type': 'application/json', 'Idempotency-Key': options.idempotencyKey ?? '' }
        : {}),
    },
    body:
      action === 'order'
        ? JSON.stringify({ plan_id: options.plan?.id, plan_version: options.plan?.version })
        : undefined,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new CapacityError(
      typeof result?.code === 'string' && /^capacity_[a-z_]+$/.test(result.code)
        ? result.code
        : 'capacity_unavailable',
    );
  }
  return response.json();
}
