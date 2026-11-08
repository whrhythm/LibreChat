import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  aiProjectCreateInput,
  PrincipalType,
  ResourceType,
  AccessRoleIds,
} from 'librechat-data-provider';
import type { ProjectTemplate } from 'librechat-data-provider';
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
  reservePlatformLink?: (
    user: string,
    id: string,
    intent: { kind: 'assistant' | 'code'; name: string; goal: string; path?: string },
  ) => Promise<{ kind: 'assistant' | 'code'; name: string; goal: string; path?: string }>;
  archivePlatformConversations?: (
    user: string,
    projectId: string,
    agentIds: string[],
  ) => Promise<void>;
  getChatProject?: (user: string, id: string) => Promise<{ platformProjectId?: string } | null>;
  removeRetiredChatProject?: (user: string, nativeId: string, platformId: string) => Promise<void>;
  removeRetiredProjectAgent?: (id: string, owner: string) => Promise<void>;
  ensureLinkedChatProject?: (
    user: string,
    input: { id: string; name: string; goal: string; template?: ProjectTemplate },
    nativeId?: string,
  ) => Promise<{ id: string; platformProjectId: string }>;
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
  knowledge_state: z.enum(['not_configured', 'ready']),
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

const ownerId = z.string().regex(/^[0-9a-f]{24}$/);
const deletionInput = z
  .object({
    confirmation: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  })
  .strict();
const deletionState = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('confirm'),
    confirmation: z.string(),
    folder: z.string(),
    knowledge_libraries: z.number(),
    knowledge_revisions: z.number(),
    preserved_libraries: z.number(),
    trials: z.number(),
    releases: z.number(),
    shares: z.number(),
  }),
  z.object({ state: z.literal('knowledge'), remaining: z.number(), retrying: z.boolean() }),
  z.object({
    state: z.literal('native'),
    agents: z
      .array(
        z.object({
          id: z.string().regex(/^agent_(?:(?:app|trial)_)?[0-9a-f]{32}$/),
          owner_id: ownerId,
        }),
      )
      .optional(),
  }),
  z.object({ state: z.literal('deleted') }),
]);
type Action = 'list' | 'create' | 'resume' | 'inspectDeletion' | 'advanceDeletion';

/** Authentication and Agent CREATE/USE middleware must precede these handlers.
 * The control-plane service token and native owner identity never come from the browser. */
export function createAIProjectHandlers(
  deps: Dependencies,
): Record<Action, (req: Request, res: Response) => Promise<Response>> {
  const handler = (action: Action) => async (req: Request, res: Response) => {
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
      (body?.success && body.data.path && body.data.native_project_id) ||
      (body?.success && body.data.template !== undefined && !body.data.path) ||
      (action === 'resume' &&
        (!z.string().uuid().safeParse(identifier).success ||
          !z.object({}).strict().safeParse(req.body).success))
    ) {
      return res.status(400).json({ code: 'ai_projects_invalid_request' });
    }
    if (body?.success && body.data.path && !deps.ensureLinkedChatProject)
      return res.status(503).json({ code: 'ai_projects_unavailable' });
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
          signal: AbortSignal.timeout(req.config?.config?.aiProjects?.requestTimeoutMs ?? 35000),
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
      if (action === 'inspectDeletion' || action === 'advanceDeletion') {
        const nativeId = ownerId.safeParse(identifier);
        const input = deletionInput.safeParse(action === 'inspectDeletion' ? {} : req.body);
        if (!nativeId.success || !input.success)
          return res.status(400).json({ code: 'ai_projects_invalid_request' });
        if (
          !deps.getChatProject ||
          !deps.removeRetiredChatProject ||
          !deps.removeRetiredProjectAgent
        )
          return res.status(503).json({ code: 'ai_projects_unavailable' });
        const project = await deps.getChatProject(user.id, nativeId.data);
        const platformId = z.string().uuid().safeParse(project?.platformProjectId);
        if (!platformId.success) return res.status(404).json({ code: 'ai_projects_not_found' });
        const suffix = '/' + platformId.data + '/deletion';
        const owner = { native_owner_id: user.id };
        let state = deletionState.parse(
          await call(
            suffix,
            action === 'advanceDeletion' ? { ...owner, ...input.data } : undefined,
          ),
        );
        if (action === 'advanceDeletion') {
          if (state.state === 'native') {
            if (!state.agents) throw new Error('Missing retirement manifest');
            for (const agent of state.agents)
              await deps.removeRetiredProjectAgent(agent.id, agent.owner_id);
            state = deletionState.parse(await call(suffix + '/complete', owner));
          }
          if (state.state === 'deleted')
            await deps.removeRetiredChatProject(user.id, nativeId.data, platformId.data);
        }
        return res.status(200).json(state.state === 'native' ? { state: 'native' } : state);
      }
      let projectId = typeof identifier === 'string' ? identifier : '';
      if (body?.success) {
        const { native_project_id: nativeId, template: _template, ...input } = body.data;
        if (nativeId) {
          const native = await deps.getChatProject?.(user.id, nativeId);
          if (!native || !deps.ensureLinkedChatProject)
            return res.status(404).json({ code: 'ai_projects_not_found' });
          if (native.platformProjectId) projectId = native.platformProjectId;
          else {
            if (!deps.reservePlatformLink)
              return res.status(503).json({ code: 'ai_projects_unavailable' });
            const intent = await deps.reservePlatformLink(user.id, nativeId, {
              kind: 'assistant',
              name: input.name,
              goal: input.purpose,
            });
            input.name = intent.name;
            input.purpose = intent.goal;
          }
          const hash = createHash('sha256')
            .update('assistant:' + user.id + ':' + nativeId)
            .digest('hex');
          input.request_id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        }
        if (!projectId) {
          const created = bindingSchema.parse(
            await call('', { ...input, native_owner_id: user.id }),
          );
          projectId = created.project.id;
        }
        if (nativeId)
          await deps.ensureLinkedChatProject!(
            user.id,
            { id: projectId, name: input.name, goal: input.purpose },
            nativeId,
          );
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
      const input = body?.success ? body.data : undefined;
      const link = input?.path
        ? await deps.ensureLinkedChatProject!(user.id, {
            id: projectId,
            name: input.name,
            goal: input.purpose,
            ...(input.template !== undefined && { template: input.template }),
          })
        : undefined;
      await deps.archivePlatformConversations?.(user.id, projectId, [agent.id]);
      return res.status(200).json(link ? { ...confirmed, native_project_id: link.id } : confirmed);
    } catch (error) {
      if (error instanceof UpstreamFailure)
        return res.status(error.status).json({ code: error.code });
      if (error instanceof Error && error.message === 'PROJECT_TEMPLATE_CONFLICT')
        return res.status(409).json({ code: 'ai_projects_request_conflict' });
      // No automatic replay of cross-service writes. UI reloads the saved intent.
      return res.status(503).json({ code: 'ai_projects_recovery_required' });
    }
  };
  return {
    list: handler('list'),
    create: handler('create'),
    resume: handler('resume'),
    inspectDeletion: handler('inspectDeletion'),
    advanceDeletion: handler('advanceDeletion'),
  };
}
