import type { Response } from 'express';
import { createProgrammingHandlers } from './workbench';

const user = { provider: 'openid', openidIssuer: 'https://identity.test/', openidId: 'alice' };
const deps = {
  baseUrl: 'https://platform.test/internal/v1/workspace/',
  serviceToken: 's'.repeat(40),
  issuer: 'https://identity.test/',
};

it('loads and updates acceptance only on the fixed owner-bound task route', async () => {
  const request = jest.fn().mockResolvedValue(new globalThis.Response('{"revision":1}'));
  const handlers = createProgrammingHandlers({ ...deps, request });
  const res = response();
  const taskId = '12345678-1234-1234-1234-123456789abc';
  const body = { revision: 0, goal: 'sample goal', criteria: [], note: '' };
  await handlers.saveAcceptance(
    { user, params: { taskId }, body } as unknown as Input,
    res as unknown as Response,
  );
  expect(String(request.mock.calls[0][0])).toBe(
    `https://platform.test/internal/v1/workspace/agent/tasks/${taskId}/acceptance`,
  );
  expect(request.mock.calls[0][1].method).toBe('PUT');
  expect(request.mock.calls[0][1].headers['X-CodeChat-Subject']).toBe('alice');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual(body);
  request.mockClear();
  await handlers.saveAcceptance(
    { user, params: { taskId }, body: { ...body, owner: 'bob' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(request).not.toHaveBeenCalled();
  await handlers.acceptance(
    { user, params: { taskId: '../secret' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(request).not.toHaveBeenCalled();
  await handlers.acceptance(
    { user, params: { taskId } } as unknown as Input,
    res as unknown as Response,
  );
  expect(request.mock.calls[0][1].method).toBe('GET');
});

it('binds MCP credential updates to the verified user and rejects destination injection', async () => {
  const request = jest
    .fn()
    .mockResolvedValue(new globalThis.Response('{"configured":true,"revision":1}'));
  const handlers = createProgrammingHandlers({ ...deps, request });
  const res = response();
  await handlers.credential(
    {
      user,
      params: { serverId: 'mcp-test' },
      body: { revision: 0, secret: 'synthetic', owner: 'bob' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(request).not.toHaveBeenCalled();
  await handlers.credential(
    {
      user,
      params: { serverId: 'mcp-test' },
      body: { revision: 0, secret: 'synthetic' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(String(request.mock.calls[0][0])).toBe(
    'https://platform.test/internal/v1/workspace/agent/mcp/mcp-test/credential',
  );
  expect(request.mock.calls[0][1].headers['X-CodeChat-Subject']).toBe('alice');
  expect(request.mock.calls[0][1].method).toBe('PUT');
});

it('loads only the fixed MCP catalog using the verified identity', async () => {
  const request = jest.fn().mockResolvedValue(new globalThis.Response('{"servers":[]}'));
  const handlers = createProgrammingHandlers({ ...deps, request });
  const res = response();
  await handlers.mcp(
    { user, query: { url: 'http://localhost' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(String(request.mock.calls[0][0])).toBe(
    'https://platform.test/internal/v1/workspace/agent/mcp',
  );
  expect(request.mock.calls[0][1].headers['X-CodeChat-Subject']).toBe('alice');
});
type Input = Parameters<ReturnType<typeof createProgrammingHandlers>['save']>[0];
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
it('uses only the verified user and rejects injected identity or unknown strategy', async () => {
  const request = jest.fn().mockResolvedValue(new globalThis.Response('{}'));
  const handlers = createProgrammingHandlers({ ...deps, request });
  const res = response();
  const body = {
    conversation_id: 'thread-1',
    revision: 0,
    project_path: 'demo',
    strategy: 'review',
    approval: 'strict',
  };
  await handlers.save(
    { user, body: { ...body, subject: 'bob' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(request).not.toHaveBeenCalled();
  await handlers.save(
    { user, body, headers: { 'x-codechat-subject': 'bob' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(String(request.mock.calls[0][0])).toBe(
    'https://platform.test/internal/v1/workspace/agent/preferences',
  );
  expect(request.mock.calls[0][1].headers['X-CodeChat-Subject']).toBe('alice');
  expect(request.mock.calls[0][1].method).toBe('PUT');
});
it('rejects forged task routes and maps upstream diagnostics to a safe error', async () => {
  const request = jest
    .fn()
    .mockResolvedValue(new globalThis.Response('private diagnostic', { status: 500 }));
  const handlers = createProgrammingHandlers({ ...deps, request });
  const res = response();
  await handlers.cancel(
    { user, params: { taskId: '../secret' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(request).not.toHaveBeenCalled();
  await handlers.tasks({ user } as unknown as Input, res as unknown as Response);
  expect(res.status).toHaveBeenLastCalledWith(503);
  expect(res.json).toHaveBeenLastCalledWith({ code: 'agent_request_failed' });
});

it('reads an individual durable task with verified identity and no write', async () => {
  const request = jest.fn().mockResolvedValue(new globalThis.Response('{"status":"completed"}'));
  const handlers = createProgrammingHandlers({ ...deps, request });
  const res = response();
  const taskId = '12345678-1234-1234-1234-123456789abc';
  await handlers.task(
    { user, params: { taskId }, headers: { 'x-codechat-subject': 'bob' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(String(request.mock.calls[0][0])).toBe(
    `https://platform.test/internal/v1/workspace/agent/tasks/${taskId}`,
  );
  expect(request.mock.calls[0][1].method).toBe('GET');
  expect(request.mock.calls[0][1].headers['X-CodeChat-Subject']).toBe('alice');
  expect(request.mock.calls[0][1].body).toBeUndefined();
  expect(res.json).toHaveBeenLastCalledWith({ status: 'completed' });
  request.mockClear();
  await handlers.task(
    { user, params: { taskId: '../secret' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(request).not.toHaveBeenCalled();
});
