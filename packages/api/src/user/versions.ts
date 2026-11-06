import { versionInputSchema, versionRestoreSchema } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

type VersionRequest = Omit<ServerRequest, 'body'> & { body?: unknown };
type Action = 'list' | 'create' | 'diff' | 'restore' | 'remove';
type Dependencies = {
  baseUrl?: string;
  serviceToken?: string;
  issuer?: string;
  request?: (url: URL, init: RequestInit) => Promise<globalThis.Response>;
};

export function createVersionHandlers(
  deps: Dependencies,
): Record<Action, (req: VersionRequest, res: Response) => Promise<Response>> {
  const request = deps.request ?? fetch;
  const handler = (action: Action) => async (req: VersionRequest, res: Response) => {
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
      return res.status(403).json({ code: 'versions_identity_required' });
    if (!deps.baseUrl || !deps.serviceToken || deps.serviceToken.length < 32)
      return res.status(503).json({ code: 'versions_unavailable' });
    let suffix = 'versions';
    let body: string | undefined;
    let key: string | undefined;
    if (['diff', 'restore', 'remove'].includes(action)) {
      const params = req.params;
      const id =
        params && typeof params === 'object' && 'versionId' in params ? params.versionId : null;
      if (
        typeof id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
      )
        return res.status(400).json({ code: 'versions_invalid_request' });
      suffix += '/' + encodeURIComponent(id) + (action === 'remove' ? '' : '/' + action);
    }
    if (action === 'create' || action === 'restore') {
      const input = (action === 'create' ? versionInputSchema : versionRestoreSchema).safeParse(
        req.body,
      );
      const suppliedKey = req.headers?.['idempotency-key'];
      if (
        !input.success ||
        typeof suppliedKey !== 'string' ||
        !/^[a-zA-Z0-9_-]{16,128}$/.test(suppliedKey)
      )
        return res.status(400).json({ code: 'versions_invalid_request' });
      body = JSON.stringify(input.data);
      key = suppliedKey;
    }
    try {
      const url = new URL(suffix, deps.baseUrl.endsWith('/') ? deps.baseUrl : deps.baseUrl + '/');
      if (url.protocol !== 'https:' || url.username || url.password)
        return res.status(503).json({ code: 'versions_unavailable' });
      if (action === 'list') {
        const path = req.query?.path;
        if (typeof path !== 'string' || !path || path.length > 255)
          return res.status(400).json({ code: 'versions_invalid_request' });
        url.searchParams.set('path', path);
      }
      const upstream = await request(url, {
        method: { list: 'GET', create: 'POST', diff: 'GET', restore: 'POST', remove: 'DELETE' }[
          action
        ],
        headers: {
          'X-CodeChat-Service-Token': deps.serviceToken,
          'X-CodeChat-Subject': user.openidId,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(35000),
      });
      if (!upstream.ok) {
        const value = await upstream.json().catch(() => null);
        const code =
          typeof value?.detail === 'string' && /^versions_[a-z_]+$/.test(value.detail)
            ? value.detail
            : 'versions_unavailable';
        return res
          .status(
            [400, 403, 404, 409, 413, 422, 507].includes(upstream.status) ? upstream.status : 503,
          )
          .json({ code });
      }
      return res.status(upstream.status).json(await upstream.json());
    } catch {
      return res.status(503).json({ code: 'versions_unavailable' });
    }
  };
  return {
    list: handler('list'),
    create: handler('create'),
    diff: handler('diff'),
    restore: handler('restore'),
    remove: handler('remove'),
  };
}
