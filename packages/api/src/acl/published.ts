import { PermissionBits, isPublishedAppAgent } from 'librechat-data-provider';
import type { RequestHandler } from 'express';

/** Guard before native ACL/admin bypasses, including stale pre-migration grants. */
export function createPublishedAppGuard({
  resourceIdParam = 'id',
  requiredPermission = PermissionBits.EDIT,
  fallback,
}: {
  resourceIdParam?: string;
  requiredPermission?: number;
  fallback?: RequestHandler;
} = {}): RequestHandler {
  return (req, res, next) => {
    if (
      requiredPermission !== PermissionBits.VIEW &&
      isPublishedAppAgent(req.params[resourceIdParam])
    ) {
      res.status(403).json({ code: 'published_app_read_only' });
      return;
    }
    return fallback ? fallback(req, res, next) : next();
  };
}
