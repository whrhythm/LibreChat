import { z } from 'zod';
import {
  aiProjectCreateInput,
  PrincipalType,
  ResourceType,
  AccessRoleIds,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { inspectContent, extractAgentContent } from '~/protection';

type Request = Omit<ServerRequest, 'body'> & { body?: unknown };
type NativeInput = {
  allowCreate: boolean;
  id: string;
  author: string;
  name: string;
  description: string;
  instructions: string;
  provider: string;
  model: string;
};
type Dependencies = {
  baseUrl?: string;
  serviceToken?: string;
  issuer?: string;
  request?: (url: URL, init: RequestInit) => Promise<globalThis.Response>;
  ensurePrivateProjectAgent: (
    data: NativeInput,
  ) => Promise<{ id: string; resourceId: string; ownerId: string }>;
  grantPermission: (data: {
    principalType: PrincipalType;
    principalId: string;
    resourceType: ResourceType;
    resourceId: string;
    accessRoleId: string;
    grantedBy: string;
  }) => Promise<unknown>;
};
const bindingSchema = z.object({
  project: z.object({ id: z.string().uuid() }).passthrough(),
  agent_id: z.string().regex(/^agent_[0-9a-f]{32}$/),
  state: z.enum(['preparing', 'ready']),
  knowledge_state: z.literal('not_configured'),
});
const preparedSchema = bindingSchema.extend({
  initial_agent: z
    .object({
      name: z.string().min(1).max(80),
      description: z.string().max(1000),
      instructions: z.string().min(1).max(64000),
      provider: z.literal('LiteLLM'),
      model: z.string().min(1).max(200),
      tools: z.array(z.never()).length(0),
      skills_enabled: z.literal(false),
    })
    .strict(),
});
class UpstreamFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Authentication and Agent CREATE/USE middleware must precede these handlers.
 * The control-plane service token and native owner identity never come from the browser. */
export function createAIProjectHandlers(deps: Dependencies) {
  const handler = (action: 'list' | 'create' | 'resume') => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = req.user;
    if (
      user?.provider !== 'openid' ||
      !user.openidId ||
      !user.openidIssuer ||
      !deps.issuer ||
      user.openidIssuer.replace(/\/$/, '') !== deps.issuer.replace(/\/$/, '') ||
      !/^[0-9a-f]{24}$/.test(user.id)
    ) {
      return res.status(403).json({ code: 'ai_projects_identity_required' });
    }
    if (!deps.baseUrl || !deps.serviceToken || deps.serviceToken.length < 32) {
      return res.status(503).json({ code: 'ai_projects_unavailable' });
    }
    const body = action === 'create' ? aiProjectCreateInput.safeParse(req.body) : null;
    const params = req.params;
    const identifier =
      params && typeof params === 'object' && 'projectId' in params ? params.projectId : undefined;
    if (
      (body && !body.success) ||
      (action === 'resume' &&
        (!z.string().uuid().safeParse(identifier).success ||
          !z.object({}).strict().safeParse(req.body).success))
    ) {
      return res.status(400).json({ code: 'ai_projects_invalid_request' });
    }
    try {
      const base = new URL(deps.baseUrl.endsWith('/') ? deps.baseUrl : deps.baseUrl + '/');
      if (base.protocol !== 'https:' || base.username || base.password) {
        return res.status(503).json({ code: 'ai_projects_unavailable' });
      }
      const call = async (suffix: string, payload?: object): Promise<unknown> => {
        const upstream = await (deps.request ?? fetch)(new URL('ai-projects' + suffix, base), {
          method: payload ? 'POST' : 'GET',
          redirect: 'error',
          headers: {
            'X-CodeChat-Service-Token': deps.serviceToken!,
            'X-CodeChat-Subject': user.openidId!,
            ...(payload ? { 'Content-Type': 'application/json' } : {}),
          },
          body: payload ? JSON.stringify(payload) : undefined,
          signal: AbortSignal.timeout(req.config?.aiProjects?.requestTimeoutMs ?? 35000),
        });
        const result = await upstream.json();
        if (!upstream.ok) {
          const detail = z
            .object({ detail: z.string().regex(/^ai_projects_[a-z_]+$/) })
            .safeParse(result);
          throw new UpstreamFailure(
            [400, 403, 404, 409, 422].includes(upstream.status) ? upstream.status : 503,
            detail.success ? detail.data.detail : 'ai_projects_unavailable',
          );
        }
        return result;
      };
      if (action === 'list') return res.status(200).json(await call(''));
      let projectId = typeof identifier === 'string' ? identifier : '';
      if (body?.success) {
        const created = bindingSchema.parse(
          await call('', { ...body.data, native_owner_id: user.id }),
        );
        projectId = created.project.id;
      }
      const prepared = preparedSchema.parse(
        await call('/' + projectId + '/prepare', { native_owner_id: user.id }),
      );
      if (prepared.project.id !== projectId) throw new Error('Project binding response mismatch');
      const { tools: _tools, skills_enabled: _skills, ...initial } = prepared.initial_agent;
      if (inspectContent(extractAgentContent(initial), { filters: req.config?.filters })) {
        return res.status(400).json({ code: 'ai_projects_content_rejected' });
      }
      const agent = await deps.ensurePrivateProjectAgent({
        ...initial,
        allowCreate: prepared.state === 'preparing',
        id: prepared.agent_id,
        author: user.id,
      });
      if (agent.ownerId !== user.id || agent.id !== prepared.agent_id)
        throw new Error('Agent ownership mismatch');
      // A partial ACL failure remains resumable; never claim ready before both grants succeed.
      // Once bound, a retry must not restore permissions an administrator revoked.
      if (prepared.state === 'preparing') {
        await deps.grantPermission({
          principalType: PrincipalType.USER,
          principalId: user.id,
          resourceType: ResourceType.AGENT,
          resourceId: agent.resourceId,
          accessRoleId: AccessRoleIds.AGENT_OWNER,
          grantedBy: user.id,
        });
        await deps.grantPermission({
          principalType: PrincipalType.USER,
          principalId: user.id,
          resourceType: ResourceType.REMOTE_AGENT,
          resourceId: agent.resourceId,
          accessRoleId: AccessRoleIds.REMOTE_AGENT_OWNER,
          grantedBy: user.id,
        });
      }
      const confirmed = bindingSchema.parse(
        await call('/' + projectId + '/confirm', {
          native_owner_id: user.id,
          agent_id: agent.id,
        }),
      );
      if (
        confirmed.project.id !== projectId ||
        confirmed.agent_id !== agent.id ||
        confirmed.state !== 'ready'
      ) {
        throw new Error('Project confirmation response mismatch');
      }
      return res.status(200).json(confirmed);
    } catch (error) {
      if (error instanceof UpstreamFailure)
        return res.status(error.status).json({ code: error.code });
      // No automatic replay of cross-service writes. UI reloads the saved intent.
      return res.status(503).json({ code: 'ai_projects_recovery_required' });
    }
  };
  return { list: handler('list'), create: handler('create'), resume: handler('resume') };
}
