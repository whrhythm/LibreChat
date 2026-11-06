import type { Response } from 'express';
import { createAIProjectHandlers } from './assistants';

const projectId = '00000000-0000-4000-8000-000000000001';
const owner = 'a'.repeat(24);
const agentId = 'agent_' + '1'.repeat(32);
const user = {
  id: owner,
  provider: 'openid',
  openidIssuer: 'https://identity.test',
  openidId: 'alice',
};
const binding = {
  project: { id: projectId, name: 'Private' },
  agent_id: agentId,
  state: 'preparing',
  knowledge_state: 'not_configured',
};
const initial = {
  name: 'Private',
  description: 'Answer questions',
  instructions: 'Do not invent sources.',
  provider: 'LiteLLM',
  model: 'test-model',
  tools: [],
  skills_enabled: false,
};
type Input = Parameters<ReturnType<typeof createAIProjectHandlers>['create']>[0];
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
function setup() {
  const requests: { url: string; init: RequestInit }[] = [];
  const request = jest.fn(async (url: URL, init: RequestInit) => {
    requests.push({ url: String(url), init });
    let value: object = binding;
    if (url.pathname.endsWith('/prepare')) value = { ...binding, initial_agent: initial };
    else if (url.pathname.endsWith('/confirm')) value = { ...binding, state: 'ready' };
    return new globalThis.Response(JSON.stringify(value));
  });
  const ensurePrivateProjectAgent = jest
    .fn()
    .mockResolvedValue({ id: agentId, ownerId: owner, resourceId: 'b'.repeat(24) });
  const grantPermission = jest.fn().mockResolvedValue({});
  const handlers = createAIProjectHandlers({
    baseUrl: 'https://platform.test/internal/v1/workspace/',
    serviceToken: 's'.repeat(40),
    issuer: 'https://identity.test',
    request,
    ensurePrivateProjectAgent,
    grantPermission,
  });
  return { handlers, request, requests, ensurePrivateProjectAgent, grantPermission };
}
const input = { request_id: projectId, name: 'Private', purpose: 'Answer questions' };

it('binds only the authenticated owner and confirms after private ACL creation', async () => {
  const { handlers, requests, ensurePrivateProjectAgent, grantPermission } = setup();
  const res = response();
  await handlers.create(
    { user, body: input, headers: { 'x-codechat-subject': 'foreign' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(200);
  expect(requests).toHaveLength(3);
  expect(JSON.parse(requests[0].init.body as string)).toEqual({ ...input, native_owner_id: owner });
  expect(
    requests.every(
      (r) => (r.init.headers as Record<string, string>)['X-CodeChat-Subject'] === 'alice',
    ),
  ).toBe(true);
  expect(ensurePrivateProjectAgent).toHaveBeenCalledWith(
    expect.objectContaining({ id: agentId, author: owner, model: 'test-model' }),
  );
  expect(grantPermission).toHaveBeenCalledTimes(2);
  expect(
    grantPermission.mock.calls.every(
      ([grant]) => grant.principalId === owner && grant.principalType === 'user',
    ),
  ).toBe(true);
  expect(res.json).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ initial_agent: expect.anything() }),
  );
});

it('does not confirm on partial ACL failure; retry reconciles the same stable Agent', async () => {
  const { handlers, request, ensurePrivateProjectAgent, grantPermission } = setup();
  grantPermission.mockRejectedValueOnce(new Error('private connection information'));
  const res = response();
  const resume = { user, body: {}, params: { projectId } } as unknown as Input;
  await handlers.resume(resume, res as unknown as Response);
  expect(request).toHaveBeenCalledTimes(1);
  expect(res.json).toHaveBeenLastCalledWith({ code: 'ai_projects_recovery_required' });
  await handlers.resume(resume, res as unknown as Response);
  expect(res.status).toHaveBeenLastCalledWith(200);
  expect(ensurePrivateProjectAgent.mock.calls.map(([data]) => data.id)).toEqual([agentId, agentId]);
});

it('rejects client identity overrides and a foreign issuer before any write', async () => {
  const { handlers, request } = setup();
  const res = response();
  await handlers.create(
    { user, body: { ...input, native_owner_id: 'c'.repeat(24) } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(400);
  await handlers.create(
    { user: { ...user, openidIssuer: 'https://foreign.test' }, body: input } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(403);
  expect(request).not.toHaveBeenCalled();
});

it('does not grant access or confirm when native ownership differs', async () => {
  const { handlers, ensurePrivateProjectAgent, grantPermission, request } = setup();
  ensurePrivateProjectAgent.mockResolvedValue({
    id: agentId,
    ownerId: 'foreign',
    resourceId: 'b'.repeat(24),
  });
  const res = response();
  await handlers.resume(
    { user, body: {}, params: { projectId } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(503);
  expect(grantPermission).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});

it('a lost control-plane write reply is not automatically replayed', async () => {
  const { handlers, request, ensurePrivateProjectAgent } = setup();
  request.mockRejectedValueOnce(new Error('unknown result'));
  const res = response();
  await handlers.create({ user, body: input } as unknown as Input, res as unknown as Response);
  expect(request).toHaveBeenCalledTimes(1);
  expect(ensurePrivateProjectAgent).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenLastCalledWith({ code: 'ai_projects_recovery_required' });
});

it('does not restore revoked grants or recreate a deleted Agent for an already bound project', async () => {
  const { handlers, request, grantPermission, ensurePrivateProjectAgent } = setup();
  request.mockResolvedValueOnce(
    new globalThis.Response(JSON.stringify({ ...binding, state: 'ready', initial_agent: initial })),
  );
  const res = response();
  await handlers.resume(
    { user, body: {}, params: { projectId } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(200);
  expect(ensurePrivateProjectAgent).toHaveBeenCalledWith(
    expect.objectContaining({ allowCreate: false }),
  );
  expect(grantPermission).not.toHaveBeenCalled();
});
