import type { Response } from 'express';
import { codeChatIdentityHandler } from './codeChatIdentity';

function invoke(user: object | undefined) {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  codeChatIdentityHandler({ user } as Parameters<typeof codeChatIdentityHandler>[0], res as unknown as Response);
  return res;
}

describe('codeChatIdentityHandler', () => {
  it('returns only the currently authenticated OIDC identity with no-store', () => {
    const res = invoke({ provider: 'openid', openidIssuer: 'https://issuer/', openidId: 'subject', password: 'never-return' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json).toHaveBeenCalledWith({ issuer: 'https://issuer/', subject: 'subject' });
  });

  it.each([undefined, {}, { provider: 'local', openidId: 'subject', openidIssuer: 'issuer' }, { provider: 'openid', openidId: 'subject' }])('rejects unbound identity', (user) => {
    const res = invoke(user);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
