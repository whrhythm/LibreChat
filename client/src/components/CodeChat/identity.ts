export type Identity = { issuer: string; subject: string };

/** Match the verified LibreChat user to the separately verified OIDC ID token. */
export function sameIdentity(identity: Identity, claims: { iss: string; sub: string }): boolean {
  const normalized = (value: string) => value.replace(/\/+$/, '');
  return identity.subject === claims.sub && normalized(identity.issuer) === normalized(claims.iss);
}
