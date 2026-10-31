import { sameIdentity } from './identity';

describe('CodeChat account binding', () => {
  const identity = { issuer: 'https://identity.example/app/', subject: 'user-a' };
  it('accepts the same issuer and subject with a normalized trailing slash', () => {
    expect(sameIdentity(identity, { iss: 'https://identity.example/app', sub: 'user-a' })).toBe(true);
  });
  it('rejects another user or issuer', () => {
    expect(sameIdentity(identity, { iss: identity.issuer, sub: 'user-b' })).toBe(false);
    expect(sameIdentity(identity, { iss: 'https://other.example/app', sub: identity.subject })).toBe(false);
  });
});
