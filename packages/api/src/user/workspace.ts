import type { Response } from 'express';
import type { ServerRequest } from '~/types';

type Dependencies = {
  baseUrl?: string;
  serviceToken?: string;
  issuer?: string;
  request?: (url: URL, init: RequestInit) => Promise<globalThis.Response>;
};
type WorkspaceHandler = (req: ServerRequest, res: Response) => Promise<Response>;
type WorkspaceHandlers = {
  ensure: WorkspaceHandler;
  list: WorkspaceHandler;
  mkdir: WorkspaceHandler;
  read: WorkspaceHandler;
  write: WorkspaceHandler;
};

/** Same-origin bridge: identity is taken only from the authenticated user doc.
 * Platform credentials and arbitrary request headers never cross to the browser. */
export function createWorkspaceHandlers(deps: Dependencies): WorkspaceHandlers {
  const request = deps.request ?? fetch;
  const normalize = (value: string) => value.replace(/\/$/, '');
  const handler =
    (method: string, endpoint: string) => async (req: ServerRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const user = req.user;
      if (
        user?.provider !== 'openid' ||
        !user.openidId ||
        !user.openidIssuer ||
        !deps.issuer ||
        normalize(user.openidIssuer) !== normalize(deps.issuer)
      ) {
        return res.status(403).json({ code: 'workspace_identity_required' });
      }
      if (!deps.baseUrl || !deps.serviceToken || deps.serviceToken.length < 32) {
        return res.status(503).json({ code: 'workspace_unavailable' });
      }
      let url: URL;
      try {
        url = new URL(endpoint, deps.baseUrl.endsWith('/') ? deps.baseUrl : deps.baseUrl + '/');
        if (url.protocol !== 'https:' || url.username || url.password) {
          return res.status(503).json({ code: 'workspace_unavailable' });
        }
      } catch {
        return res.status(503).json({ code: 'workspace_unavailable' });
      }
      if (endpoint !== 'ensure') {
        if (typeof req.query.path !== 'string' || req.query.path.length > 4096) {
          return res.status(400).json({ code: 'workspace_invalid_path' });
        }
        url.searchParams.set('path', req.query.path);
        if (method === 'PUT')
          url.searchParams.set('overwrite', req.query.overwrite === 'true' ? 'true' : 'false');
      }
      if (method === 'PUT' && !Buffer.isBuffer(req.body)) {
        return res.status(400).json({ code: 'workspace_binary_required' });
      }
      try {
        const upstream = await request(url, {
          method,
          headers: {
            'X-CodeChat-Service-Token': deps.serviceToken,
            'X-CodeChat-Subject': user.openidId,
            ...(method === 'PUT' ? { 'Content-Type': 'application/octet-stream' } : {}),
          },
          body:
            method === 'PUT' && Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : undefined,
          redirect: 'error',
          signal: AbortSignal.timeout(35000),
        });
        if (!upstream.ok) {
          const status = [400, 403, 404, 409, 413, 507].includes(upstream.status)
            ? upstream.status
            : 503;
          return res
            .status(status)
            .json({ code: status === 409 ? 'workspace_preparing' : 'workspace_operation_failed' });
        }
        if (method === 'GET' && endpoint === 'file') {
          const bytes = new Uint8Array(await upstream.arrayBuffer());
          if (bytes.length > 16 * 1024 * 1024)
            return res.status(413).json({ code: 'workspace_file_too_large' });
          res.setHeader('Content-Type', 'application/octet-stream');
          return res.status(200).send(Buffer.from(bytes));
        }
        return res.status(upstream.status).json(await upstream.json());
      } catch {
        return res.status(503).json({ code: 'workspace_unavailable' });
      }
    };
  return {
    ensure: handler('POST', 'ensure'),
    list: handler('GET', 'directories'),
    mkdir: handler('POST', 'directories'),
    read: handler('GET', 'file'),
    write: handler('PUT', 'file'),
  };
}
