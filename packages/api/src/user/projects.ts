import { workspaceProjectInput } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

type Request = Omit<ServerRequest, 'body'> & { body?: unknown };
type Dependencies = {
  baseUrl?: string;
  serviceToken?: string;
  issuer?: string;
  request?: (url: URL, init: RequestInit) => Promise<globalThis.Response>;
};

export function createWorkspaceProjectHandlers(
  deps: Dependencies,
): Record<
  'list' | 'save' | 'context' | 'source',
  (req: Request, res: Response) => Promise<Response>
> {
  const handler =
    (action: 'list' | 'save' | 'context' | 'source') => async (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const user = req.user;
      if (
        user?.provider !== 'openid' ||
        !user.openidId ||
        !user.openidIssuer ||
        !deps.issuer ||
        user.openidIssuer.replace(/\/$/, '') !== deps.issuer.replace(/\/$/, '')
      )
        return res.status(403).json({ code: 'projects_identity_required' });
      if (!deps.baseUrl || !deps.serviceToken || deps.serviceToken.length < 32)
        return res.status(503).json({ code: 'projects_unavailable' });
      let suffix = 'projects';
      let body: string | undefined;
      if (action === 'context' || action === 'source') {
        const params = req.params;
        const id =
          params && typeof params === 'object' && 'projectId' in params ? params.projectId : null;
        if (
          typeof id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
        )
          return res.status(400).json({ code: 'projects_invalid_request' });
        suffix += '/' + encodeURIComponent(id) + (action === 'source' ? '/source' : '');
      }
      if (action === 'save') {
        const parsed = workspaceProjectInput.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ code: 'projects_invalid_request' });
        body = JSON.stringify(parsed.data);
      }
      try {
        const url = new URL(suffix, deps.baseUrl.endsWith('/') ? deps.baseUrl : deps.baseUrl + '/');
        if (url.protocol !== 'https:' || url.username || url.password)
          return res.status(503).json({ code: 'projects_unavailable' });
        const upstream = await (deps.request ?? fetch)(url, {
          method: body ? 'PUT' : 'GET',
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
          const code =
            typeof value?.detail === 'string' && /^projects_[a-z_]+$/.test(value.detail)
              ? value.detail
              : 'projects_unavailable';
          return res
            .status(
              [400, 403, 404, 409, 413, 422].includes(upstream.status) ? upstream.status : 503,
            )
            .json({ code });
        }
        return res.status(upstream.status).json(await upstream.json());
      } catch {
        return res.status(503).json({ code: 'projects_unavailable' });
      }
    };
  return {
    list: handler('list'),
    save: handler('save'),
    context: handler('context'),
    source: handler('source'),
  };
}
