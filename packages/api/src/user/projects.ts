import { z } from 'zod';
import { createHash } from 'node:crypto';
import { projectRootPath, workspaceProjectInput } from 'librechat-data-provider';
import type { ProjectTemplate } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

type Request = Omit<ServerRequest, 'body'> & { body?: unknown };
type Dependencies = {
  clearConflictingCodeLink?: (user: string, id: string, path: string) => Promise<void>;
  reservePlatformLink?: (
    user: string,
    id: string,
    intent: { kind: 'assistant' | 'code'; name: string; goal: string; path?: string },
  ) => Promise<{ kind: 'assistant' | 'code'; name: string; goal: string; path?: string }>;
  getChatProject?: (user: string, id: string) => Promise<{ platformProjectId?: string } | null>;
  listLinkedProjectNames?: (user: string, ids: string[]) => Promise<Record<string, string>>;
  ensureLinkedChatProject?: (
    user: string,
    input: { id: string; name: string; goal: string; template?: ProjectTemplate },
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
      let createWithRoot = false;
      let template: ProjectTemplate | undefined;
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
        const { native_project_id, template: requestedTemplate, ...input } = parsed.data;
        template = requestedTemplate;
        nativeId = native_project_id;
        createWithRoot = input.request_id !== undefined;
        if (template !== undefined && !createWithRoot)
          return res.status(400).json({ code: 'projects_invalid_request' });
        if (
          createWithRoot &&
          (nativeId || input.revision !== 0 || !projectRootPath.safeParse(input.path).success)
        )
          return res.status(400).json({ code: 'projects_invalid_request' });
        if (createWithRoot && !deps.ensureLinkedChatProject)
          return res.status(503).json({ code: 'projects_unavailable' });
        body = JSON.stringify(input);
      }
      try {
        if (nativeId) {
          if (
            !deps.ensureLinkedChatProject ||
            !deps.reservePlatformLink ||
            !projectRootPath.safeParse(workspaceProjectInput.parse(req.body).path).success ||
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
          const digest = createHash('sha256')
            .update('code:' + user.id + ':' + nativeId)
            .digest('hex');
          body = JSON.stringify({
            name: intent.name,
            goal: intent.goal,
            path: intent.path,
            revision: 0,
            request_id: `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`,
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
          const value = await upstream.json().catch(() => null);
          const code =
            typeof value?.detail === 'string' && /^projects_[a-z_]+$/.test(value.detail)
              ? value.detail
              : 'projects_unavailable';
          if (
            nativeId &&
            upstream.status === 409 &&
            (code === 'projects_root_exists' || code === 'projects_root_in_use')
          ) {
            await deps.clearConflictingCodeLink?.(user.id, nativeId, JSON.parse(body!).path);
          }
          return res
            .status(
              [400, 403, 404, 409, 413, 422].includes(upstream.status) ? upstream.status : 503,
            )
            .json({ code });
        }
        const result = await upstream.json();
        if (createWithRoot) {
          const project = z
            .object({ id: z.string().uuid(), name: z.string(), goal: z.string() })
            .passthrough()
            .parse(result);
          const link = await deps.ensureLinkedChatProject!(user.id, {
            ...project,
            ...(template !== undefined && { template }),
          });
          return res.status(upstream.status).json({ ...project, native_project_id: link.id });
        }
        if (action === 'list' && deps.listLinkedProjectNames) {
          const value = z
            .object({ projects: z.array(z.object({ id: z.string().uuid() }).passthrough()) })
            .parse(result);
          const names = await deps.listLinkedProjectNames(
            user.id,
            value.projects.map((p) => p.id),
          );
          return res.json({
            projects: value.projects.map((p) => ({ ...p, project_label: names[p.id] })),
          });
        }
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
      } catch (error) {
        if (error instanceof Error && error.message === 'PROJECT_TEMPLATE_CONFLICT')
          return res.status(409).json({ code: 'projects_request_conflict' });
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
