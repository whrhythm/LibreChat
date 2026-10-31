import type { Response } from 'express';
import type { ServerRequest } from '~/types';

/** The browser uses this only to bind its separately authorized platform session
 * to the currently authenticated LibreChat account. It is not an API credential. */
export function codeChatIdentityHandler(req: ServerRequest, res: Response): Response {
  const user = req.user;
  if (user?.provider !== 'openid' || !user.openidId || !user.openidIssuer) {
    return res.status(403).json({ code: 'openid_identity_required' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ issuer: user.openidIssuer, subject: user.openidId });
}
