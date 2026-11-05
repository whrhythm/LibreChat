import type { Response, NextFunction } from 'express';
import type { ServerRequest } from '~/types';
import { createManagedAccountGate } from './accountAccess';

describe('managed account access', () => {
  const user = { provider: 'openid', openidId: 'alice', openidIssuer: 'https://identity.test/' };
  const req = (subject = 'alice') => ({ user: { ...user, openidId: subject } }) as ServerRequest;
  function setup(ttl = 15000) {
    const request = jest.fn(async () => ({ ok: true, json: async () => ({ allowed: true }) }));
    const onAllowed = jest.fn();
    const gate = createManagedAccountGate({
      baseUrl: 'https://platform.test/internal/v1/workspace/',
      issuer: user.openidIssuer,
      serviceToken: 'synthetic-service-token'.repeat(3),
      request: request as unknown as typeof fetch,
      getConfig: async () => ({ config: { codechat: { accountStatusCacheMs: ttl } } }),
      onAllowed,
    });
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    return {
      gate,
      request,
      onAllowed,
      json,
      status,
      res: { status } as unknown as Response,
      next: jest.fn() as NextFunction,
    };
  }
  it('deduplicates bursts and never shares cached status between users', async () => {
    const h = setup();
    await Promise.all([h.gate(req(), h.res, h.next), h.gate(req(), h.res, h.next)]);
    expect(h.request).toHaveBeenCalledTimes(1);
    await h.gate(req('bob'), h.res, h.next);
    expect(h.request).toHaveBeenCalledTimes(2);
    expect(h.onAllowed).toHaveBeenCalledTimes(3);
  });
  it('refreshes status and blocks a previously allowed account', async () => {
    const h = setup(0);
    await h.gate(req(), h.res, h.next);
    h.request.mockResolvedValue({ ok: true, json: async () => ({ allowed: false }) });
    await h.gate(req(), h.res, h.next);
    expect(h.status).toHaveBeenCalledWith(403);
    expect(h.onAllowed).toHaveBeenCalledTimes(1);
  });
  it('does not expose provider diagnostics or use stale allow after a failed refresh', async () => {
    const h = setup(0);
    await h.gate(req(), h.res, h.next);
    h.request.mockRejectedValue(new Error('secret-provider-diagnostic'));
    await h.gate(req(), h.res, h.next);
    expect(h.status).toHaveBeenCalledWith(503);
    expect(JSON.stringify(h.json.mock.calls)).not.toContain('secret-provider');
    expect(h.onAllowed).toHaveBeenCalledTimes(1);
  });
  it('rejects unbound identities without contacting the platform', async () => {
    const h = setup();
    await h.gate(
      { user: { ...user, openidIssuer: 'https://other.test/' } } as ServerRequest,
      h.res,
      h.next,
    );
    expect(h.status).toHaveBeenCalledWith(403);
    expect(h.request).not.toHaveBeenCalled();
  });
});
