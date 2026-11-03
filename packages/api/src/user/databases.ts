import { projectDatabaseInputSchema, projectDatabaseDeleteSchema } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

type Input = Omit<ServerRequest, 'body'> & { body?: unknown };
type Handler = (req: Input, res: Response) => Promise<Response>;
type Handlers = Record<'list' | 'create' | 'retry' | 'remove', Handler>;
type Dependencies = {
  baseUrl?: string;
  serviceToken?: string;
  issuer?: string;
  request?: (url: URL, init: RequestInit) => Promise<globalThis.Response>;
};

/** Fixed public metadata routes only. The agent credential/profile route is never proxied. */
export function createProjectDatabaseHandlers(deps: Dependencies): Handlers {
  const request = deps.request ?? fetch;
  const handler =
    (action: 'list' | 'create' | 'retry' | 'delete') => async (req: Input, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const user = req.user;
      if (
        user?.provider !== 'openid' ||
        !user.openidId ||
        !user.openidIssuer ||
        !deps.issuer ||
        user.openidIssuer.replace(/\/$/, '') !== deps.issuer.replace(/\/$/, '')
      )
        return res.status(403).json({ code: 'database_identity_required' });
      if (!deps.baseUrl || !deps.serviceToken || deps.serviceToken.length < 32)
        return res.status(503).json({ code: 'database_unavailable' });
      let suffix = 'databases';
      let body: string | undefined;
      if (action === 'create' || action === 'delete') {
        const input = (
          action === 'create' ? projectDatabaseInputSchema : projectDatabaseDeleteSchema
        ).safeParse(req.body);
        if (!input.success) return res.status(400).json({ code: 'database_invalid_request' });
        body = JSON.stringify(input.data);
      }
      if (action === 'retry' || action === 'delete') {
        const id =
          req.params && typeof req.params === 'object' && 'databaseId' in req.params
            ? req.params.databaseId
            : null;
        if (
          typeof id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
        )
          return res.status(400).json({ code: 'database_invalid_request' });
        suffix += `/${encodeURIComponent(id)}/${action}`;
      }
      try {
        const url = new URL(suffix, deps.baseUrl.endsWith('/') ? deps.baseUrl : deps.baseUrl + '/');
        if (url.protocol !== 'https:' || url.username || url.password)
          return res.status(503).json({ code: 'database_unavailable' });
        const upstream = await request(url, {
          method: action === 'list' ? 'GET' : 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(35000),
          body,
          headers: {
            'X-CodeChat-Service-Token': deps.serviceToken,
            'X-CodeChat-Subject': user.openidId,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
        });
        if (!upstream.ok) {
          const value = await upstream.json().catch(() => null);
          const code =
            typeof value?.detail === 'string' &&
            /^(database_|project_databases_|remove_application_|wait_for_database_)[a-z_]+$/.test(
              value.detail,
            )
              ? value.detail
              : 'database_unavailable';
          return res
            .status([400, 403, 404, 409, 422].includes(upstream.status) ? upstream.status : 503)
            .json({ code });
        }
        return res.status(upstream.status).json(await upstream.json());
      } catch {
        return res.status(503).json({ code: 'database_unavailable' });
      }
    };
  return {
    list: handler('list'),
    create: handler('create'),
    retry: handler('retry'),
    remove: handler('delete'),
  };
}
