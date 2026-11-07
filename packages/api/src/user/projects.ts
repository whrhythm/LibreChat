import { z } from 'zod';
import { workspaceProjectInput } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

type Request = Omit<ServerRequest, 'body'> & { body?: unknown };
type Dependencies = {
  reservePlatformLink?: (
    user: string,
    id: string,
    intent: { kind: 'assistant' | 'code'; name: string; goal: string; path?: string },
  ) => Promise<{ kind: 'assistant' | 'code'; name: string; goal: string; path?: string }>;
  getChatProject?: (user: string, id: string) => Promise<{ platformProjectId?: string } | null>;
  ensureLinkedChatProject?: (
    user: string,
    input: { id: string; name: string; goal: string },
    nativeId?: string,
  ) => Promise<{ id: string; platformProjectId: string }>;
  baseUrl?: string;
  serviceToken?: string;
  issuer?: string;
  request?: (url: URL, init: RequestInit) => Promise<globalThis.Response>;
};

export function createWorkspaceProjectHandlers(
  deps: Dependencies,
): Record<
  'list' | 'save' | 'context' | 'source' | 'sync',
  (req: Request, res: Response) => Promise<Response>
> {
  const handler =
    (action: 'list' | 'save' | 'context' | 'source' | 'sync') =>
    async (req: Request, res: Response) => {
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
      if (action === 'sync' && !/^[0-9a-f]{24}$/.test(user.id ?? ''))
        return res.status(403).json({ code: 'projects_identity_required' });
      let suffix = 'projects';
      let body: string | undefined;
      let nativeId: string | undefined;
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
        const { native_project_id, ...input } = parsed.data;
        nativeId = native_project_id;
        body = JSON.stringify(input);
      }
      try {
        if (nativeId) {
          if (
            !deps.ensureLinkedChatProject ||
            !deps.reservePlatformLink ||
            !(await deps.getChatProject?.(user.id, nativeId))
          )
            return res.status(404).json({ code: 'projects_not_found' });
          const input = workspaceProjectInput.parse(req.body);
          const intent = await deps.reservePlatformLink(user.id, nativeId, {
            kind: 'code',
            name: input.name,
            goal: input.goal,
            path: input.path,
          });
          body = JSON.stringify({
            name: intent.name,
            goal: intent.goal,
            path: intent.path,
            revision: 0,
          });
        }
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
          if (nativeId && upstream.status === 409) {
            const observed = await (deps.request ?? fetch)(url, {
              method: 'GET',
              headers: {
                'X-CodeChat-Service-Token': deps.serviceToken,
                'X-CodeChat-Subject': user.openidId,
              },
              redirect: 'error',
              signal: AbortSignal.timeout(35000),
            });
            if (observed.ok) {
              const saved = z
                .object({
                  projects: z.array(
                    z
                      .object({
                        id: z.string().uuid(),
                        name: z.string(),
                        goal: z.string(),
                        path: z.string(),
                      })
                      .passthrough(),
                  ),
                })
                .parse(await observed.json());
              const input = JSON.parse(body!);
              const project = saved.projects.find(
                (p) => p.path === input.path && p.name === input.name && p.goal === input.goal,
              );
              if (project) {
                await deps.ensureLinkedChatProject!(user.id, project, nativeId);
                return res.json(project);
              }
            }
          }
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
        const result = await upstream.json();
        if (nativeId) {
          const project = z
            .object({ id: z.string().uuid(), name: z.string(), goal: z.string() })
            .parse(result);
          await deps.ensureLinkedChatProject!(user.id, project, nativeId);
        }
        if (action === 'sync') {
          if (!deps.ensureLinkedChatProject)
            return res.status(503).json({ code: 'projects_unavailable' });
          const value = z
            .object({
              projects: z.array(
                z.object({ id: z.string().uuid(), name: z.string(), goal: z.string() }),
              ),
            })
            .parse(result);
          const links = [];
          for (const project of value.projects)
            links.push(await deps.ensureLinkedChatProject(user.id, project));
          return res.json({ links });
        }
        return res.status(upstream.status).json(result);
      } catch {
        return res.status(503).json({ code: 'projects_unavailable' });
      }
    };
  return {
    list: handler('list'),
    save: handler('save'),
    context: handler('context'),
    source: handler('source'),
    sync: handler('sync'),
  };
}
