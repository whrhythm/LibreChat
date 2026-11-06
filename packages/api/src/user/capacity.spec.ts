import type { Response } from 'express';
import { createCapacityHandlers } from './capacity';

const user = { provider: 'openid', openidIssuer: 'https://identity.test/', openidId: 'alice' };
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
const deps = {
  baseUrl: 'https://platform.test/internal/v1/workspace/',
  serviceToken: 's'.repeat(40),
  issuer: 'https://identity.test/',
};
type Input = Parameters<ReturnType<typeof createCapacityHandlers>['order']>[0];

it('scopes checkout and polling to the verified owner and fixed routes', async () => {
  const request = jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        new globalThis.Response(JSON.stringify({ state: 'awaiting_payment' }), { status: 200 }),
      ),
    );
  const bridge = createCapacityHandlers({ ...deps, request });
  const res = response();
  const input = {
    user,
    params: { orderId: '11111111-1111-4111-8111-111111111111' },
  } as unknown as Input;
  await bridge.checkout(input, res as unknown as Response);
  await bridge.payment(input, res as unknown as Response);
  expect(String(request.mock.calls[0][0])).toMatch(/\/checkout$/);
  expect(request.mock.calls[0][1]).toMatchObject({
    method: 'POST',
    headers: { 'X-CodeChat-Subject': 'alice' },
  });
  expect(String(request.mock.calls[1][0])).toMatch(/\/payment$/);
  expect(request.mock.calls[1][1].method).toBe('GET');
});

it('forwards only validated order fields and idempotency, using the authenticated identity', async () => {
  const request = jest
    .fn()
    .mockResolvedValue(
      new globalThis.Response(JSON.stringify({ status: 'pending_payment' }), { status: 201 }),
    );
  const bridge = createCapacityHandlers({ ...deps, request });
  const res = response();
  await bridge.order(
    {
      user,
      body: { plan_id: 'basic', plan_version: 'test-v1' },
      headers: { 'idempotency-key': 'test-order-key-123', 'x-codechat-subject': 'bob' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(String(request.mock.calls[0][0])).toBe(
    'https://platform.test/internal/v1/workspace/capacity/orders',
  );
  expect(request.mock.calls[0][1].headers).toEqual(
    expect.objectContaining({
      'X-CodeChat-Subject': 'alice',
      'Idempotency-Key': 'test-order-key-123',
    }),
  );
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
    plan_id: 'basic',
    plan_version: 'test-v1',
  });
  expect(res.status).toHaveBeenCalledWith(201);
});

it('rejects browser identity and price fields, missing issuer, and invalid identifiers without forwarding', async () => {
  const request = jest.fn();
  const bridge = createCapacityHandlers({ ...deps, request });
  const res = response();
  await bridge.order(
    {
      user,
      body: { plan_id: 'basic', plan_version: 'test-v1', amount_minor: 0 },
      headers: { 'idempotency-key': 'test-order-key-123' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(400);
  await bridge.account(
    { user: { ...user, openidIssuer: 'https://other.test' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(403);
  await bridge.confirm(
    { user, params: { orderId: '../other' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(400);
  expect(request).not.toHaveBeenCalled();
});

it('discloses only stable capacity error codes, including when the provider fails', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(
      new globalThis.Response(JSON.stringify({ detail: 'private provider response' }), {
        status: 500,
      }),
    )
    .mockResolvedValueOnce(
      new globalThis.Response(JSON.stringify({ detail: 'capacity_plan_changed' }), { status: 409 }),
    );
  const bridge = createCapacityHandlers({ ...deps, request });
  const res = response();
  await bridge.account({ user } as unknown as Input, res as unknown as Response);
  expect(res.status).toHaveBeenLastCalledWith(503);
  expect(res.json).toHaveBeenLastCalledWith({ code: 'capacity_unavailable' });
  await bridge.account({ user } as unknown as Input, res as unknown as Response);
  expect(res.json).toHaveBeenLastCalledWith({ code: 'capacity_plan_changed' });
});

it('retries only the authenticated users storage and never forwards browser identity, endpoint or credentials', async () => {
  const request = jest.fn().mockResolvedValue(
    new globalThis.Response(JSON.stringify({ enabled: true, status: 'preparing' }), {
      status: 202,
    }),
  );
  const bridge = createCapacityHandlers({ ...deps, request });
  const res = response();
  await bridge.objectRetry(
    {
      user,
      body: { subject: 'bob', url: 'https://other.test', secret: 'synthetic' },
      headers: { 'x-codechat-subject': 'bob' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(String(request.mock.calls[0][0])).toBe(
    'https://platform.test/internal/v1/workspace/object-storage/retry',
  );
  expect(request.mock.calls[0][1]).toEqual(
    expect.objectContaining({
      method: 'POST',
      body: undefined,
      redirect: 'error',
      headers: expect.objectContaining({ 'X-CodeChat-Subject': 'alice' }),
    }),
  );
  expect(res.status).toHaveBeenCalledWith(202);
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
});

it('rejects unverified storage identities and sanitizes provider failure details', async () => {
  const request = jest.fn().mockResolvedValue(
    new globalThis.Response(JSON.stringify({ detail: 'private storage diagnostics' }), {
      status: 500,
    }),
  );
  const bridge = createCapacityHandlers({ ...deps, request });
  const res = response();
  await bridge.objectRetry(
    { user: { ...user, openidIssuer: 'https://other.test' } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(403);
  expect(request).not.toHaveBeenCalled();
  await bridge.objectRetry({ user } as unknown as Input, res as unknown as Response);
  expect(res.status).toHaveBeenLastCalledWith(503);
  expect(res.json).toHaveBeenLastCalledWith({ code: 'capacity_unavailable' });
});
