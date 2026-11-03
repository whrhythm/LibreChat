import type { Response } from 'express';
import { createProjectDatabaseHandlers } from './databases';

const user = { provider: 'openid', openidIssuer: 'https://identity.test/', openidId: 'alice' };
const deps = {
  baseUrl: 'https://platform.test/internal/v1/workspace/',
  serviceToken: 's'.repeat(40),
  issuer: 'https://identity.test/',
};
type Input = Parameters<ReturnType<typeof createProjectDatabaseHandlers>['create']>[0];
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

it('uses the verified owner and only forwards the project path', async () => {
  const request = jest
    .fn()
    .mockResolvedValue(
      new globalThis.Response(JSON.stringify({ status: 'requested' }), { status: 202 }),
    );
  const bridge = createProjectDatabaseHandlers({ ...deps, request });
  const res = response();
  await bridge.create(
    {
      user,
      body: { project_path: 'demo' },
      headers: { 'x-codechat-subject': 'bob' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(String(request.mock.calls[0][0])).toBe(
    'https://platform.test/internal/v1/workspace/databases',
  );
  expect(request.mock.calls[0][1].headers['X-CodeChat-Subject']).toBe('alice');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ project_path: 'demo' });
  expect(res.status).toHaveBeenCalledWith(202);
});
it('rejects forged ownership, traversal and dynamic endpoints before any upstream request', async () => {
  const request = jest.fn();
  const bridge = createProjectDatabaseHandlers({ ...deps, request });
  for (const body of [
    { project_path: '../outside' },
    { project_path: 'demo', environment_id: 'another' },
    { project_path: '/profile' },
  ]) {
    const res = response();
    await bridge.create({ user, body } as unknown as Input, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
  }
  const res = response();
  await bridge.remove(
    {
      user,
      params: { databaseId: '../../profile' },
      body: { confirmation: 'demo' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenCalledWith(400);
  await bridge.list(
    { user: { ...user, openidIssuer: 'https://other.test' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenCalledWith(403);
  expect(request).not.toHaveBeenCalled();
});
it('preserves actionable application dependency errors and hides upstream diagnostics', async () => {
  const request = jest.fn().mockResolvedValue(
    new globalThis.Response(JSON.stringify({ detail: 'remove_application_before_database' }), {
      status: 409,
    }),
  );
  const res = response();
  await createProjectDatabaseHandlers({ ...deps, request }).remove(
    {
      user,
      params: { databaseId: '00000000-0000-0000-0000-000000000001' },
      body: { confirmation: 'demo' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.json).toHaveBeenCalledWith({ code: 'remove_application_before_database' });
  request.mockResolvedValue(new globalThis.Response('private diagnostic', { status: 500 }));
  await createProjectDatabaseHandlers({ ...deps, request }).list(
    { user } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.json).toHaveBeenLastCalledWith({ code: 'database_unavailable' });
});
