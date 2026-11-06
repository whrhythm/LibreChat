import type { Response } from 'express';
import { createVersionHandlers } from './versions';

const user = { provider: 'openid', openidIssuer: 'https://identity.test/', openidId: 'alice' };
const deps = {
  baseUrl: 'https://platform.test/internal/v1/workspace/',
  serviceToken: 's'.repeat(40),
  issuer: 'https://identity.test/',
};
type Input = Parameters<ReturnType<typeof createVersionHandlers>['create']>[0];
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
it('forwards restore target and stable request key using only verified identity', async () => {
  const request = jest
    .fn()
    .mockResolvedValue(new globalThis.Response(JSON.stringify({ status: 'ready' })));
  const handlers = createVersionHandlers({ ...deps, request });
  const res = response();
  await handlers.restore(
    {
      user,
      params: { versionId: '12345678-1234-1234-1234-123456789abc' },
      body: { target: 'restored' },
      headers: { 'idempotency-key': 'restore-key-000001', 'x-codechat-subject': 'bob' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(request.mock.calls[0][1].headers).toEqual(
    expect.objectContaining({
      'X-CodeChat-Subject': 'alice',
      'Idempotency-Key': 'restore-key-000001',
    }),
  );
  expect(request.mock.calls[0][1].body).toBe(JSON.stringify({ target: 'restored' }));
  expect(String(request.mock.calls[0][0])).toBe(
    deps.baseUrl + 'versions/12345678-1234-1234-1234-123456789abc/restore',
  );
});
it('rejects identity substitution, unsafe identifiers and arbitrary restore paths before forwarding', async () => {
  const request = jest.fn();
  const handlers = createVersionHandlers({ ...deps, request });
  const res = response();
  await handlers.list(
    {
      user: { ...user, openidIssuer: 'https://other.test/' },
      query: { path: 'project' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(403);
  await handlers.diff(
    { user, params: { versionId: '../other' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(400);
  await handlers.create(
    {
      user,
      body: { path: 'project', name: 'first', subject: 'bob' },
      headers: { 'idempotency-key': 'create-key-000001' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(400);
  await handlers.restore(
    {
      user,
      params: { versionId: '12345678-1234-1234-1234-123456789abc' },
      body: { target: '../escape' },
      headers: { 'idempotency-key': 'restore-key-000001' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(request).not.toHaveBeenCalled();
});
it('preserves quota and uncertain-outcome codes while redacting provider diagnostics', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(
      new globalThis.Response(JSON.stringify({ detail: 'versions_storage_full' }), { status: 507 }),
    )
    .mockResolvedValueOnce(
      new globalThis.Response(JSON.stringify({ detail: 'versions_restore_uncertain' }), {
        status: 503,
      }),
    )
    .mockRejectedValueOnce(new Error('private provider credential'));
  const handlers = createVersionHandlers({ ...deps, request });
  const res = response();
  for (let i = 0; i < 3; i++) {
    await handlers.list(
      { user, query: { path: 'project' } } as unknown as Input,
      res as unknown as Response,
    );
  }
  expect(res.status.mock.calls.map((call) => call[0])).toEqual([507, 503, 503]);
  expect(res.json.mock.calls.map((call) => call[0])).toEqual([
    { code: 'versions_storage_full' },
    { code: 'versions_restore_uncertain' },
    { code: 'versions_unavailable' },
  ]);
});
