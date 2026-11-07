import { PermissionBits } from 'librechat-data-provider';
import type { Request, Response } from 'express';
import { createPublishedAppGuard } from './published';

describe('published application native routes', () => {
  it.each([PermissionBits.EDIT, PermissionBits.DELETE, PermissionBits.SHARE, 3, 15])(
    'blocks permission %s before stale ACLs or admin bypass',
    (requiredPermission) => {
      const fallback = jest.fn();
      const next = jest.fn();
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      createPublishedAppGuard({ requiredPermission, resourceIdParam: 'agent_id', fallback })(
        { params: { agent_id: 'agent_app_' + 'a'.repeat(32) } } as unknown as Request,
        res as unknown as Response,
        next,
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(fallback).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['agent_app_' + 'a'.repeat(32), PermissionBits.VIEW],
    ['agent_' + 'a'.repeat(32), PermissionBits.EDIT],
    ['agent_trial_' + 'a'.repeat(32), PermissionBits.EDIT],
  ])('preserves ordinary ACL checks for %s / %s', (id, requiredPermission) => {
    const fallback = jest.fn();
    createPublishedAppGuard({ requiredPermission: Number(requiredPermission), fallback })(
      { params: { id } } as unknown as Request,
      {} as Response,
      jest.fn(),
    );
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
