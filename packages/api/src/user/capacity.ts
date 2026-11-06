import { capacityOrderInputSchema } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

type CapacityRequest = Omit<ServerRequest, 'body'> & { body?: unknown };
type CapacityHandler = (req: CapacityRequest, res: Response) => Promise<Response>;
type CapacityHandlers = Record<
  'account' | 'order' | 'confirm' | 'retry' | 'cancel' | 'objectRetry' | 'checkout' | 'payment',
  CapacityHandler
>;
type Dependencies = {
  baseUrl?: string;
  serviceToken?: string;
  issuer?: string;
  request?: (url: URL, init: RequestInit) => Promise<globalThis.Response>;
};

/** Identity comes from the verified user document; only fixed capacity routes cross this bridge. */
export function createCapacityHandlers(deps: Dependencies): CapacityHandlers {
  const request = deps.request ?? fetch;
  const handler =
    (
      action:
        | 'account'
        | 'order'
        | 'confirm-test'
        | 'retry'
        | 'cancel'
        | 'object-retry'
        | 'checkout'
        | 'payment',
    ) =>
    async (req: CapacityRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const user = req.user;
      if (
        user?.provider !== 'openid' ||
        !user.openidId ||
        !user.openidIssuer ||
        !deps.issuer ||
        user.openidIssuer.replace(/\/$/, '') !== deps.issuer.replace(/\/$/, '')
      )
        return res.status(403).json({ code: 'capacity_identity_required' });
      if (!deps.baseUrl || !deps.serviceToken || deps.serviceToken.length < 32)
        return res.status(503).json({ code: 'capacity_unavailable' });
      let suffix = 'capacity';
      let body: string | undefined;
      let idempotency: string | undefined;
      if (action === 'object-retry') {
        suffix = 'object-storage/retry';
      } else if (action === 'order') {
        const input = capacityOrderInputSchema.safeParse(req.body);
        const key = req.headers?.['idempotency-key'];
        if (!input.success || typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(key))
          return res.status(400).json({ code: 'capacity_invalid_order' });
        body = JSON.stringify(input.data);
        idempotency = key;
        suffix += '/orders';
      } else if (action !== 'account') {
        const params = req.params;
        const id =
          params && typeof params === 'object' && 'orderId' in params ? params.orderId : null;
        if (
          typeof id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
        )
          return res.status(400).json({ code: 'capacity_invalid_order' });
        suffix += `/orders/${encodeURIComponent(id)}/${action}`;
      }
      try {
        const url = new URL(suffix, deps.baseUrl.endsWith('/') ? deps.baseUrl : deps.baseUrl + '/');
        if (url.protocol !== 'https:' || url.username || url.password)
          return res.status(503).json({ code: 'capacity_unavailable' });
        const upstream = await request(url, {
          method: action === 'account' || action === 'payment' ? 'GET' : 'POST',
          headers: {
            'X-CodeChat-Service-Token': deps.serviceToken,
            'X-CodeChat-Subject': user.openidId,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
          },
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(35000),
        });
        if (!upstream.ok) {
          const status = [400, 403, 404, 409, 422].includes(upstream.status)
            ? upstream.status
            : 503;
          const value = await upstream.json().catch(() => null);
          const code =
            typeof value?.detail === 'string' &&
            /^(capacity_|object_storage_|payment_)[a-z_]+$/.test(value.detail)
              ? value.detail
              : 'capacity_unavailable';
          return res.status(status).json({ code });
        }
        return res.status(upstream.status).json(await upstream.json());
      } catch {
        return res.status(503).json({ code: 'capacity_unavailable' });
      }
    };
  return {
    account: handler('account'),
    order: handler('order'),
    confirm: handler('confirm-test'),
    retry: handler('retry'),
    cancel: handler('cancel'),
    objectRetry: handler('object-retry'),
    checkout: handler('checkout'),
    payment: handler('payment'),
  };
}
