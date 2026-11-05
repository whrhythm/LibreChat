import type { NextFunction, Response } from 'express';
import type { ServerRequest } from '~/types';

type Dependencies = {
  baseUrl?: string;
  issuer?: string;
  serviceToken?: string;
  request?: typeof fetch;
  getConfig?: () => Promise<{ config?: { codechat?: { accountStatusCacheMs?: number } } } | null>;
  onAllowed: (req: ServerRequest, res: Response, next: NextFunction) => void;
};

/** Bound access checks for existing sessions; no account data or credentials enter the browser. */
export function createManagedAccountGate(
  deps: Dependencies,
): (req: ServerRequest, res: Response, next: NextFunction) => Promise<void | Response> {
  const cache = new Map<string, { allowed: boolean; until: number }>();
  const pending = new Map<string, Promise<boolean>>();
  return async (req: ServerRequest, res: Response, next: NextFunction) => {
    if (!deps.baseUrl) return deps.onAllowed(req, res, next);
    const user = req.user;
    if (
      user?.provider !== 'openid' ||
      !user.openidId ||
      !user.openidIssuer ||
      !deps.issuer ||
      user.openidIssuer.replace(/\/$/, '') !== deps.issuer.replace(/\/$/, '')
    ) {
      return res.status(403).json({ code: 'account_identity_required' });
    }
    const key = JSON.stringify([user.openidIssuer, user.openidId]);
    try {
      let result = cache.get(key);
      if (!result || result.until <= Date.now()) {
        let check = pending.get(key);
        if (!check) {
          const subject = user.openidId;
          check = (async () => {
            if (
              !deps.serviceToken ||
              deps.serviceToken.length < 32 ||
              !deps.baseUrl?.startsWith('https://')
            )
              throw new Error('not_configured');
            const url = new URL(
              'account-access',
              deps.baseUrl.endsWith('/') ? deps.baseUrl : deps.baseUrl + '/',
            );
            const response = await (deps.request ?? fetch)(url, {
              redirect: 'error',
              signal: AbortSignal.timeout(8000),
              headers: {
                'X-CodeChat-Service-Token': deps.serviceToken,
                'X-CodeChat-Subject': subject,
              },
            });
            if (!response.ok) throw new Error('unavailable');
            const value: { allowed?: unknown } = await response.json();
            if (typeof value.allowed !== 'boolean') throw new Error('invalid_response');
            const config = await deps.getConfig?.();
            const ttl = Math.min(
              30000,
              Math.max(0, config?.config?.codechat?.accountStatusCacheMs ?? 15000),
            );
            if (cache.size >= 10000) cache.clear();
            cache.set(key, { allowed: value.allowed, until: Date.now() + ttl });
            return value.allowed;
          })().finally(() => pending.delete(key));
          pending.set(key, check);
        }
        result = { allowed: await check, until: 0 };
      }
      if (!result.allowed)
        return res
          .status(403)
          .json({ code: 'account_disabled', message: '账号已禁用，请联系管理员。' });
      return deps.onAllowed(req, res, next);
    } catch {
      return res.status(503).json({
        code: 'account_status_unavailable',
        message: '暂时无法核验账号状态，请稍后重试。',
      });
    }
  };
}
