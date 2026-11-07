import type { Response } from 'express';
import { createReleaseHandlers, preparePublishedApp } from './releases';
import { createTrialConversationGuard } from './trials';
import { getTrialContext } from './trialContext';
const project = '00000000-0000-4000-8000-000000000001';
const entry = '00000000-0000-4000-8000-000000000002';
const user = {
  id: 'b'.repeat(24),
  provider: 'openid',
  openidId: 'guest',
  openidIssuer: 'https://id.test',
};
const data = {
  id: project,
  project_id: project,
  number: 1,
  trial_id: entry,
  digest: 'a'.repeat(64),
  knowledge_revision_id: entry,
  created_at: '2026-11-07T00:00:00Z',
  entry_id: entry,
  agent_id: 'agent_app_' + entry.replace(/-/g, ''),
  name: 'Support',
  model: 'test',
  ready: true,
  payer: 'creator',
  credential: 'sbapp_server-only',
  snapshot: {
    instructions: 'Private business instruction',
    model: { provider: 'LiteLLM', model: 'test', temperature: 0, max_output_tokens: 512 },
    skills: [],
    tools: [{ tool_id: 'file_search' }],
  },
};
type Input = Parameters<ReturnType<typeof createReleaseHandlers>['launch']>[0];
function request(body: object = {}) {
  return {
    user,
    body,
    params: { projectId: project },
    config: {
      config: { aiProjects: { trialsEnabled: true, releasesEnabled: true } },
      endpoints: {
        custom: [{ name: 'LiteLLM', apiKey: 'user_provided', baseURL: 'https://original.test' }],
      },
    },
  } as unknown as Input;
}
function setup() {
  const deps = {
    baseUrl: 'https://pc.test/internal/v1/workspace/',
    issuer: 'https://id.test',
    serviceToken: 's'.repeat(40),
    request: jest.fn(async () => new globalThis.Response(JSON.stringify(data))),
    getAgent: jest.fn(),
    getConvo: jest.fn(),
    getMessages: jest.fn(),
    findUser: jest.fn(),
    ensurePrivateTrialAgent: jest
      .fn()
      .mockResolvedValue({ id: data.agent_id, ownerId: user.id, resourceId: 'resource' }),
    grantPermission: jest.fn(),
  };
  return { deps, handlers: createReleaseHandlers(deps) };
}
function response() {
  const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

it('launch returns only public metadata and never the owner instruction or server credential', async () => {
  const { handlers, deps } = setup();
  const res = response();
  await handlers.launch(request(), res as unknown as Response);
  const output = res.json.mock.calls[0][0];
  expect(output.credential).toBeUndefined();
  expect(output.snapshot).toBeUndefined();
  expect(deps.ensurePrivateTrialAgent.mock.calls[0][0].instructions).not.toContain(
    data.snapshot.instructions,
  );
  expect(deps.grantPermission).not.toHaveBeenCalled();
});
it('pins runtime and sponsored transport without mutating shared config or retaining client extras', async () => {
  const { deps } = setup();
  const req = request({
    agent_id: data.agent_id,
    conversationId: project,
    model: 'evil',
    ephemeralAgent: { execute_code: true },
  });
  const shared = req.config;
  const endpointOption = {
    agent_id: data.agent_id,
    agent: Promise.resolve({ instructions: 'evil' }),
  };
  const params = { req, endpointOption, foregroundRunId: 'server-answer' } as unknown as Parameters<
    typeof preparePublishedApp
  >[0];
  await preparePublishedApp(params, deps);
  expect(shared?.endpoints?.custom?.[0].apiKey).toBe('user_provided');
  expect(req.config?.endpoints?.custom?.[0].apiKey).toBe('sbapp_server-only');
  expect(req.config?.endpoints?.custom?.[0].baseURL).toBe('https://pc.test/agent/app/v1');
  expect((await endpointOption.agent).instructions).toContain(data.snapshot.instructions);
  expect(getTrialContext(req)?.entryId).toBe(entry);
  const init = deps.request.mock.calls[0] as unknown as [URL, RequestInit];
  expect(JSON.parse(String(init[1].body))).toMatchObject({
    native_owner_id: user.id,
    message_id: 'server-answer',
  });
});
it('rejects extra client instructions and unverified member account lookup', async () => {
  const { deps, handlers } = setup();
  const params = {
    req: request({ agent_id: data.agent_id, promptPrefix: 'override' }),
    endpointOption: {},
  };
  await expect(
    preparePublishedApp(params as unknown as Parameters<typeof preparePublishedApp>[0], deps),
  ).rejects.toMatchObject({ code: 'ai_releases_override_rejected' });
  deps.findUser.mockResolvedValue({
    _id: 'c'.repeat(24),
    email: 'guest@example.test',
    provider: 'openid',
    openidId: 'x',
    openidIssuer: 'https://id.test',
    emailVerified: false,
  });
  const res = response();
  await handlers.member(
    request({ identifier: 'guest@example.test', enabled: true }),
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenCalledWith(409);
  expect(deps.request).not.toHaveBeenCalled();
});
it('prevents switching an existing application conversation to an ordinary or another agent', async () => {
  const res = response();
  const next = jest.fn();
  const guard = createTrialConversationGuard(async () => ({ agent_id: data.agent_id }));
  await guard(
    request({ conversationId: project, agent_id: 'agent_other' }) as Parameters<typeof guard>[0],
    res as unknown as Response,
    next,
  );
  expect(res.status).toHaveBeenCalledWith(409);
  expect(next).not.toHaveBeenCalled();
});

it('allows an explicit stable member ID and revokes it without mutable email lookup', async () => {
  const { deps, handlers } = setup();
  const result = { application: null, releases: [], members: [] };
  deps.request.mockResolvedValue(new globalThis.Response(JSON.stringify(result)));
  deps.findUser.mockResolvedValue({
    _id: 'c'.repeat(24), email: 'unverified@example.test', provider: 'openid',
    openidId: 'stable-subject', openidIssuer: 'https://id.test', emailVerified: false,
  });
  const res = response();
  await handlers.member(request({ identifier: 'c'.repeat(24), enabled: true }), res as unknown as Response);
  expect(deps.findUser).toHaveBeenCalledWith({ _id: 'c'.repeat(24) }, expect.any(String));
  expect(res.json).toHaveBeenCalledWith(result);
  deps.findUser.mockClear();
  deps.request.mockResolvedValue(new globalThis.Response(JSON.stringify(result)));
  await handlers.member(request({ identifier: 'c'.repeat(24), enabled: false }), res as unknown as Response);
  expect(deps.findUser).not.toHaveBeenCalled();
  const last = deps.request.mock.calls.at(-1) as unknown as [URL, RequestInit];
  expect(last[0].pathname).toContain('/members/revoke');
});
