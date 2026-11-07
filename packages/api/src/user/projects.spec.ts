import type { Response } from 'express';
import { createWorkspaceProjectHandlers } from './projects';

const user = { provider: 'openid', openidIssuer: 'https://identity.test/', openidId: 'alice' };
const config = {
  baseUrl: 'https://platform.test/internal/v1/workspace/',
  serviceToken: 's'.repeat(40),
  issuer: 'https://identity.test/',
};
type Input = Parameters<ReturnType<typeof createWorkspaceProjectHandlers>['save']>[0];
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

it('synchronizes only authoritative owned project records, ignoring browser claims', async () => {
  const project = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Existing',
    goal: 'Keep data',
  };
  const ensureLinkedChatProject = jest
    .fn()
    .mockResolvedValue({ id: 'a'.repeat(24), platformProjectId: project.id });
  const request = jest
    .fn()
    .mockResolvedValue(new globalThis.Response(JSON.stringify({ projects: [project] })));
  const handler = createWorkspaceProjectHandlers({ ...config, request, ensureLinkedChatProject });
  const res = response();
  await handler.sync(
    {
      user: { ...user, id: 'b'.repeat(24) },
      body: { owner: 'other', projects: [{ id: 'forged' }] },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(ensureLinkedChatProject).toHaveBeenCalledWith('b'.repeat(24), project);
  expect(ensureLinkedChatProject).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][1].method).toBe('GET');
});
it('uses authenticated identity and preserves the metadata revision without file mutations', async () => {
  const request = jest
    .fn()
    .mockResolvedValue(new globalThis.Response(JSON.stringify({ id: 'project' })));
  const handlers = createWorkspaceProjectHandlers({ ...config, request });
  const res = response();
  const body = { path: 'old-folder', name: 'New label', goal: 'My goal', revision: 2 };
  await handlers.save(
    { user, body, headers: { 'x-codechat-subject': 'bob' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(String(request.mock.calls[0][0])).toBe(config.baseUrl + 'projects');
  expect(request.mock.calls[0][1]).toMatchObject({
    method: 'PUT',
    headers: { 'X-CodeChat-Subject': 'alice' },
    body: JSON.stringify(body),
    redirect: 'error',
  });
});
it('rejects foreign issuer, path-shaped identifiers and owner fields before forwarding', async () => {
  const request = jest.fn();
  const handlers = createWorkspaceProjectHandlers({ ...config, request });
  const res = response();
  await handlers.list(
    { user: { ...user, openidIssuer: 'https://foreign.test' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(403);
  await handlers.context(
    { user, params: { projectId: '../foreign' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(400);
  await handlers.save(
    {
      user,
      body: { path: 'old', name: 'Project', goal: '', revision: 0, owner: 'foreign' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(400);
  expect(request).not.toHaveBeenCalled();
});
it('preserves conflicts and sanitizes provider errors', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(
      new globalThis.Response(JSON.stringify({ detail: 'projects_changed' }), { status: 409 }),
    )
    .mockResolvedValueOnce(
      new globalThis.Response(JSON.stringify({ detail: 'secret upstream body' }), { status: 500 }),
    )
    .mockRejectedValueOnce(new Error('private transport error'));
  const handlers = createWorkspaceProjectHandlers({ ...config, request });
  const res = response();
  for (let n = 0; n < 3; n++)
    await handlers.list({ user } as unknown as Input, res as unknown as Response);
  expect(res.status.mock.calls.map((call) => call[0])).toEqual([409, 503, 503]);
  expect(res.json.mock.calls.map((call) => call[0])).toEqual([
    { code: 'projects_changed' },
    { code: 'projects_unavailable' },
    { code: 'projects_unavailable' },
  ]);
});
