import { z } from 'zod';
import {
  EModelEndpoint,
  appEntrySchema,
  releaseListSchema,
  publishSchema,
  releaseAccessSchema,
  releaseMemberSchema,
  memberPolicySchema,
  invitationReplySchema,
  assistantCatalogSchema,
  personalTrialToolReference,
  releaseToolReviewSchema,
  trialsSchema,
  reviewedTrialToolName,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { TrialDependencies, TrialTransport } from './trials';
import type { ServerRequest } from '~/types';
import { TrialFailure, trialClient, fixedSnapshotSchema, applyFixedSnapshot } from './trials';
import { appIdFromAgent, getTrialContext, setTrialContext } from './trialContext';
import { availableTrialActions } from './trialActions';

type Request = Omit<ServerRequest, 'body'> & { body?: unknown };
type Dependencies = TrialDependencies & {
  findUser: (filter: { email: string } | { _id: string }, select: string) => Promise<unknown>;
};
const nativeUser = z.object({
  _id: z.unknown(),
  provider: z.literal('openid'),
  openidId: z.string().min(1),
  openidIssuer: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
});

export function releaseClient(req: Request, deps: TrialTransport): ReturnType<typeof trialClient> {
  if (!req.config?.config?.aiProjects?.releasesEnabled)
    throw new TrialFailure(503, 'ai_releases_unavailable');
  return trialClient(req, deps);
}

export function createReleaseHandlers(
  deps: Dependencies,
): Record<
  | 'list'
  | 'publish'
  | 'access'
  | 'member'
  | 'launch'
  | 'source'
  | 'catalog'
  | 'policy'
  | 'invitation'
  | 'toolReview'
  | 'submitToolReview',
  (req: Request, res: Response) => Promise<Response>
> {
  const handler =
    (
      action:
        | 'list'
        | 'publish'
        | 'access'
        | 'member'
        | 'launch'
        | 'source'
        | 'catalog'
        | 'policy'
        | 'invitation'
        | 'toolReview'
        | 'submitToolReview',
    ) =>
    async (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const call = releaseClient(req, deps);
        if (action === 'catalog')
          return res.json(assistantCatalogSchema.parse(await call('catalog')));
        if (action === 'source') {
          const { entryId: id } = z.object({ entryId: z.string().uuid() }).parse(req.params);
          const name = z.string().min(1).max(124).parse(req.query.name);
          return res.json(await call('entries/' + id + '/source?name=' + encodeURIComponent(name)));
        }
        const { projectId: project } = z.object({ projectId: z.string().uuid() }).parse(req.params);
        if (action === 'toolReview')
          return res.json(
            releaseToolReviewSchema.parse(await call(project + '/releases/tool-review')),
          );
        if (action === 'submitToolReview') {
          z.object({}).strict().parse(req.body);
          const draft = trialsSchema.parse(await call(project + '/trials'));
          const reference = personalTrialToolReference.safeParse(draft.config?.tool_reference);
          const tool = reference.success
            ? (await availableTrialActions(req, deps, reference.data))[0]
            : undefined;
          if (!tool || !draft.digest)
            throw new TrialFailure(409, 'ai_releases_tool_review_required');
          return res.json(
            releaseToolReviewSchema.parse(
              await call(project + '/releases/tool-review', {
                reference: tool.definition.reference,
                expected_digest: draft.digest,
                descriptor: {
                  title: tool.definition.service,
                  name: tool.definition.name,
                  description: tool.definition.description,
                  target: tool.target,
                  parameters: Object.keys(tool.definition.input_schema.properties ?? {}),
                },
              }),
            ),
          );
        }
        if (action === 'policy')
          return res.json(
            releaseListSchema.parse(
              await call(project + '/members/policy', memberPolicySchema.parse(req.body)),
            ),
          );
        if (action === 'invitation')
          return res.json(
            z
              .object({ state: z.enum(['active', 'declined']) })
              .parse(await call(project + '/invitation', invitationReplySchema.parse(req.body))),
          );
        if (action === 'list')
          return res.json(releaseListSchema.parse(await call(project + '/releases')));
        if (action === 'publish') {
          const input = publishSchema.parse(req.body);
          if (
            input.confirm_tool_reference &&
            !(await availableTrialActions(req, deps, input.confirm_tool_reference)).length
          )
            throw new TrialFailure(409, 'ai_releases_tool_review_required');
          return res.json(releaseListSchema.parse(await call(project + '/releases', input)));
        }
        if (action === 'access')
          return res.json(
            releaseListSchema.parse(
              await call(project + '/access', releaseAccessSchema.parse(req.body)),
            ),
          );
        if (action === 'member') {
          const input = releaseMemberSchema.parse(req.body);
          const byId = /^[0-9a-f]{24}$/.test(input.identifier);
          if (!input.enabled) {
            if (!byId) throw new TrialFailure(400, 'ai_releases_invalid_request');
            return res.json(
              releaseListSchema.parse(
                await call(project + '/members/revoke', {
                  native_id: input.identifier,
                  expected_revision: input.expected_revision,
                }),
              ),
            );
          }
          if (!byId && !z.string().email().safeParse(input.identifier).success)
            throw new TrialFailure(400, 'ai_releases_invalid_request');
          const member = nativeUser.safeParse(
            await deps.findUser(
              byId ? { _id: input.identifier } : { email: input.identifier.toLowerCase() },
              '_id email emailVerified provider openidId openidIssuer',
            ),
          );
          if (
            !member.success ||
            (!byId && !member.data.emailVerified) ||
            member.data.openidIssuer.replace(/\/$/, '') !== deps.issuer?.replace(/\/$/, '')
          )
            throw new TrialFailure(409, 'ai_releases_member_unavailable');
          return res.json(
            releaseListSchema.parse(
              await call(project + '/members', {
                subject: member.data.openidId,
                native_id: String(member.data._id),
                label: member.data.email,
                enabled: input.enabled,
                expected_revision: input.expected_revision,
                budget_micros: input.budget_micros,
                expires_at: input.expires_at,
              }),
            ),
          );
        }
        z.object({}).strict().parse(req.body);
        const entry = appEntrySchema.parse(await call(project + '/launch', {}));
        const agent = await deps.ensurePrivateTrialAgent({
          id: entry.agent_id,
          author: req.user!.id,
          allowCreate: !entry.ready,
          name: entry.name + ' · 正式版 ' + entry.number,
          description: '已发布的业务助手；模型费用由创建者承担。',
          instructions: '此入口的实际配置由平台发布版本解析，不能在此编辑。',
          provider: 'LiteLLM',
          model: entry.model,
        });
        if (agent.ownerId !== req.user!.id || agent.id !== entry.agent_id)
          throw new TrialFailure(403, 'ai_releases_access_denied');
        // The database method grants only private chat VIEW, including on retries.
        // Never make the recipient the owner of this managed runtime entry.
        return res.json(
          appEntrySchema.parse(await call('entries/' + entry.entry_id + '/confirm', {})),
        );
      } catch (error) {
        if (error instanceof TrialFailure)
          return res.status(error.status).json({ code: error.code });
        if (error instanceof z.ZodError)
          return res.status(400).json({ code: 'ai_releases_invalid_request' });
        return res.status(503).json({ code: 'ai_releases_unavailable' });
      }
    };
  return {
    list: handler('list'),
    publish: handler('publish'),
    access: handler('access'),
    member: handler('member'),
    launch: handler('launch'),
    source: handler('source'),
    catalog: handler('catalog'),
    policy: handler('policy'),
    invitation: handler('invitation'),
    toolReview: handler('toolReview'),
    submitToolReview: handler('submitToolReview'),
  };
}

const resolvedSchema = appEntrySchema.extend({
  snapshot: fixedSnapshotSchema(),
  credential: z.string().startsWith('sbapp_'),
  personal_tool: z
    .object({
      reference: personalTrialToolReference,
      owner_native_id: z.string().regex(/^[0-9a-f]{24}$/),
    })
    .nullish(),
});
export async function preparePublishedApp(
  params: Parameters<typeof import('./trials').prepareProjectTrial>[0],
  deps: TrialTransport,
): Promise<void> {
  const { req, endpointOption } = params;
  const id = appIdFromAgent(endpointOption.agent_id ?? req.body.agent_id);
  if (!id) return;
  const body = req.body as Record<string, unknown>;
  for (const key of [
    'promptPrefix',
    'addedConvo',
    'files',
    'attachments',
    'skillIds',
    'invokeSkills',
    'manualSkills',
    'subagentContext',
  ]) {
    const value = body[key];
    if (value && (!Array.isArray(value) || value.length))
      throw new TrialFailure(400, 'ai_releases_override_rejected');
  }
  if (!(await endpointOption.agent)) throw new TrialFailure(404, 'ai_releases_not_found');
  const call = releaseClient(req, deps);
  const run = {
    conversation_id: z
      .string()
      .uuid()
      .parse(params.requestBody?.conversationId ?? body.conversationId),
    message_id: z
      .string()
      .min(1)
      .max(100)
      .parse(params.foregroundRunId ?? params.requestBody?.messageId),
  };
  const data = resolvedSchema.parse(await call('entries/' + id + '/resolve', run));
  if (data.entry_id !== id || data.agent_id !== 'agent_app_' + id.replace(/-/g, ''))
    throw new TrialFailure(503, 'ai_releases_unavailable');
  const reference = data.snapshot.tools.find((tool) => tool.tool_id.startsWith('action:'))?.tool_id;
  if (reference !== data.personal_tool?.reference)
    throw new TrialFailure(403, 'ai_releases_tool_review_required');
  const tool = data.personal_tool
    ? (await availableTrialActions(req, deps, reference, data.personal_tool.owner_native_id))[0]
    : undefined;
  if (reference && !tool) throw new TrialFailure(403, 'ai_releases_tool_review_required');
  applyFixedSnapshot(
    params,
    data,
    data.name + ' · 正式版 ' + data.number,
    '平台状态：已发布版本 ' +
      data.number +
      '。你是面向受邀成员的业务助手，模型费用由创建者承担。按获授权知识和实际工具结果回答。' +
      (tool
        ? `查询工具 ${tool.definition.name} 在本发布版本的实际调用名为 ${reviewedTrialToolName}。`
        : ''),
  );
  setTrialContext(req, { ...getTrialContext(req)!, entryId: id });
  if (tool) {
    setTrialContext(req, {
      ...getTrialContext(req)!,
      reviewedTool: {
        definition: tool.definition,
        invoke: async (input, signal) => {
          const admission = z
            .object({ allowed: z.literal(true) })
            .parse(await call('entries/' + id + '/tool-admission', run, signal));
          if (admission.allowed) return tool.invoke(input, signal);
          throw new TrialFailure(403, 'ai_releases_access_denied');
        },
      },
    });
    ((await endpointOption.agent) as { tools: string[] }).tools.push(reviewedTrialToolName);
  }
  const original = req.config!;
  const custom = original.endpoints?.[EModelEndpoint.custom] ?? [];
  const base = new URL('/agent/app/v1', deps.baseUrl!);
  // Request-local copy: never place another user's credential in the shared config/cache.
  req.config = {
    ...original,
    endpoints: {
      ...original.endpoints,
      [EModelEndpoint.custom]: custom.map((c) =>
        c.name === 'LiteLLM'
          ? {
              ...c,
              apiKey: data.credential,
              baseURL: base.toString(),
              headers: {},
              titleConvo: false,
              addParams: {},
              dropParams: [],
              models: { fetch: false, default: [data.snapshot.model.model] },
            }
          : c,
      ),
    },
  };
}
