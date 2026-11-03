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
  deleteFile: WorkspaceHandler;
  usage: WorkspaceHandler;
  archive: WorkspaceHandler;
  models: WorkspaceHandler;
  apps: WorkspaceHandler;
  publish: WorkspaceHandler;
  start: WorkspaceHandler;
  stop: WorkspaceHandler;
  remove: WorkspaceHandler;
};

/** Same-origin bridge: identity is taken only from the authenticated user doc.
 * Platform credentials and arbitrary request headers never cross to the browser. */
export function createWorkspaceHandlers(deps: Dependencies): WorkspaceHandlers {
  const request = deps.request ?? fetch;
  const normalize = (value: string) => value.replace(/\/$/, '');
  const handler =
    (method: string, endpoint: string, action?: string) =>
    async (req: ServerRequest, res: Response) => {
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
        let suffix = endpoint;
        if (action) {
          if (!req.params || typeof req.params !== 'object' || !('applicationId' in req.params)) {
            return res.status(400).json({ code: 'application_invalid_id' });
          }
          const identifier = req.params.applicationId;
          if (typeof identifier !== 'string' || !/^[0-9a-f-]{36}$/.test(identifier)) {
            return res.status(400).json({ code: 'application_invalid_id' });
          }
          suffix = `apps/${encodeURIComponent(identifier)}/${action}`;
        }
        url = new URL(suffix, deps.baseUrl.endsWith('/') ? deps.baseUrl : deps.baseUrl + '/');
        if (url.protocol !== 'https:' || url.username || url.password) {
          return res.status(503).json({ code: 'workspace_unavailable' });
        }
      } catch {
        return res.status(503).json({ code: 'workspace_unavailable' });
      }
      if (
        endpoint !== 'ensure' &&
        endpoint !== 'usage' &&
        endpoint !== 'models' &&
        !(endpoint === 'apps' && (method === 'GET' || action))
      ) {
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
      const ifMatch = req.headers?.['if-match'];
      const requiresVersion =
        method === 'DELETE' || (method === 'PUT' && req.query.overwrite === 'true');
      if (requiresVersion && (typeof ifMatch !== 'string' || !/^"[0-9a-f]{64}"$/.test(ifMatch))) {
        return res.status(428).json({ code: 'workspace_version_required' });
      }
      try {
        const upstream = await request(url, {
          method,
          headers: {
            'X-CodeChat-Service-Token': deps.serviceToken,
            'X-CodeChat-Subject': user.openidId,
            ...(requiresVersion && typeof ifMatch === 'string' ? { 'If-Match': ifMatch } : {}),
            ...(method === 'PUT' ? { 'Content-Type': 'application/octet-stream' } : {}),
          },
          body:
            method === 'PUT' && Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : undefined,
          redirect: 'error',
          signal: AbortSignal.timeout(35000),
        });
        if (!upstream.ok) {
          const status = [400, 403, 404, 409, 413, 428, 507].includes(upstream.status)
            ? upstream.status
            : 503;
          let code = 'workspace_operation_failed';
          if (status === 409) code = 'workspace_preparing';
          if (status === 409 && endpoint === 'file') code = 'workspace_file_conflict';
          return res.status(status).json({ code });
        }
        if (method === 'GET' && (endpoint === 'file' || endpoint === 'archive')) {
          const bytes = new Uint8Array(await upstream.arrayBuffer());
          if (bytes.length > (endpoint === 'archive' ? 32 : 16) * 1024 * 1024)
            return res.status(413).json({ code: 'workspace_file_too_large' });
          res.setHeader(
            'Content-Type',
            endpoint === 'archive' ? 'application/zip' : 'application/octet-stream',
          );
          const etag = upstream.headers.get('etag');
          if (etag && /^"[0-9a-f]{64}"$/.test(etag)) res.setHeader('ETag', etag);
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
    deleteFile: handler('DELETE', 'file'),
    usage: handler('GET', 'usage'),
    archive: handler('GET', 'archive'),
    models: handler('GET', 'models'),
    apps: handler('GET', 'apps'),
    publish: handler('POST', 'apps'),
    start: handler('POST', 'apps', 'start'),
    stop: handler('POST', 'apps', 'stop'),
    remove: handler('POST', 'apps', 'delete'),
  };
}
