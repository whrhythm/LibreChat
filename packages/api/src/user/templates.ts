import { templateCreateInput, templateAcceptanceInput } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
type Request = Omit<ServerRequest, 'body'> & { body?: unknown };
type Action = 'catalog' | 'create' | 'status' | 'prepare' | 'preview' | 'access' | 'acceptance';
type Dependencies = {
  baseUrl?: string;
  serviceToken?: string;
  issuer?: string;
  request?: (url: URL, init: RequestInit) => Promise<globalThis.Response>;
};

export function createBusinessTemplateHandlers(
  deps: Dependencies,
): Record<Action, (req: Request, res: Response) => Promise<Response>> {
  const handler = (action: Action) => async (req: Request, res: Response) => {
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
      return res.status(403).json({ code: 'templates_identity_required' });
    if (!deps.baseUrl || !deps.serviceToken || deps.serviceToken.length < 32)
      return res.status(503).json({ code: 'templates_unavailable' });
    let suffix = 'business-templates',
      body: string | undefined;
    if (!['catalog', 'create'].includes(action)) {
      const params = req.params;
      const id =
        params && typeof params === 'object' && 'projectId' in params ? params.projectId : null;
      if (
        typeof id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
      )
        return res.status(400).json({ code: 'templates_invalid_request' });
      suffix += '/' + id + (action === 'status' ? '' : '/' + action);
    }
    if (action === 'create' || action === 'acceptance') {
      const parsed = (
        action === 'create' ? templateCreateInput : templateAcceptanceInput
      ).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ code: 'templates_invalid_request' });
      body = JSON.stringify(parsed.data);
    }
    try {
      const url = new URL(suffix, deps.baseUrl.endsWith('/') ? deps.baseUrl : deps.baseUrl + '/');
      if (url.protocol !== 'https:' || url.username || url.password)
        return res.status(503).json({ code: 'templates_unavailable' });
      let method = 'GET';
      if (['create', 'prepare', 'access'].includes(action)) method = 'POST';
      if (action === 'acceptance') method = 'PUT';
      const upstream = await (deps.request ?? fetch)(url, {
        method,
        headers: {
          'X-CodeChat-Service-Token': deps.serviceToken,
          'X-CodeChat-Subject': user.openidId,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(35000),
      });
      if (!upstream.ok) {
        const value = await upstream.json().catch(() => null);
        return res
          .status(
            [400, 403, 404, 409, 413, 422, 507].includes(upstream.status) ? upstream.status : 503,
          )
          .json({
            code:
              typeof value?.detail === 'string' && /^templates_[a-z_]+$/.test(value.detail)
                ? value.detail
                : 'templates_unavailable',
          });
      }
      return res.status(upstream.status).json(await upstream.json());
    } catch {
      return res.status(503).json({ code: 'templates_unavailable' });
    }
  };
  return {
    catalog: handler('catalog'),
    create: handler('create'),
    status: handler('status'),
    prepare: handler('prepare'),
    preview: handler('preview'),
    access: handler('access'),
    acceptance: handler('acceptance'),
  };
}
