import type { Response } from 'express';
import { createBusinessTemplateHandlers } from './templates';
const user = { provider: 'openid', openidId: 'owner', openidIssuer: 'https://identity.test/' };
const deps = {
  baseUrl: 'https://platform.test/internal/v1/workspace/',
  serviceToken: 's'.repeat(40),
  issuer: 'https://identity.test/',
};
type Input = Parameters<ReturnType<typeof createBusinessTemplateHandlers>['create']>[0];
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
it('uses the signed-in owner and rejects extra credential or price fields', async () => {
  const request = jest
    .fn()
    .mockResolvedValue(
      new globalThis.Response(JSON.stringify({ project: { id: 'project' } }), { status: 201 }),
    );
  const handlers = createBusinessTemplateHandlers({ ...deps, request });
  const res = response();
  const body = { request_id: '11111111-1111-4111-8111-111111111111', name: 'Support' };
  await handlers.create(
    { user, body: { ...body, owner: 'foreign' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(400);
  expect(request).not.toHaveBeenCalled();
  await handlers.create({ user, body } as unknown as Input, res as unknown as Response);
  expect(request.mock.calls[0][1].headers['X-CodeChat-Subject']).toBe('owner');
  expect(request.mock.calls[0][1].method).toBe('POST');
});
it('does not proxy arbitrary routes or disclose provider failures', async () => {
  const request = jest
    .fn()
    .mockResolvedValue(
      new globalThis.Response(JSON.stringify({ detail: 'private secret' }), { status: 500 }),
    );
  const handlers = createBusinessTemplateHandlers({ ...deps, request });
  const res = response();
  await handlers.access(
    { user, params: { projectId: '../elsewhere' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(request).not.toHaveBeenCalled();
  await handlers.catalog({ user } as unknown as Input, res as unknown as Response);
  expect(res.json).toHaveBeenLastCalledWith({ code: 'templates_unavailable' });
});
