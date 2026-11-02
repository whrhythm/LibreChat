import type { Response } from 'express';
import { createWorkspaceHandlers } from './workspace';

const user = { provider: 'openid', openidIssuer: 'https://identity.test/', openidId: 'alice' };
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('workspace same-origin bridge', () => {
  it('requires a version for destructive file changes and forwards it without browser identity headers', async () => {
    const request = jest
      .fn()
      .mockResolvedValue(new globalThis.Response(JSON.stringify({ deleted: true })));
    const handlers = createWorkspaceHandlers({
      baseUrl: 'https://platform.test/internal/v1/workspace/',
      serviceToken: 's'.repeat(40),
      issuer: 'https://identity.test/',
      request,
    });
    const res = response();
    const version = '"' + 'a'.repeat(64) + '"';
    await handlers.deleteFile(
      { user, query: { path: 'app.py' }, headers: {} } as unknown as Parameters<
        typeof handlers.deleteFile
      >[0],
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenLastCalledWith(428);
    expect(request).not.toHaveBeenCalled();
    await handlers.deleteFile(
      {
        user,
        query: { path: 'app.py' },
        headers: { 'if-match': version, 'x-codechat-subject': 'bob' },
      } as unknown as Parameters<typeof handlers.deleteFile>[0],
      res as unknown as Response,
    );
    expect(String(request.mock.calls[0][0])).toBe(
      'https://platform.test/internal/v1/workspace/file?path=app.py',
    );
    expect(request.mock.calls[0][1].headers).toMatchObject({
      'If-Match': version,
      'X-CodeChat-Subject': 'alice',
    });
  });
  it('forwards lifecycle actions to a fixed application path and rejects malformed identifiers', async () => {
    const request = jest
      .fn()
      .mockResolvedValue(
        new globalThis.Response(JSON.stringify({ status: 'changing' }), { status: 202 }),
      );
    const handlers = createWorkspaceHandlers({
      baseUrl: 'https://platform.test/internal/v1/workspace/',
      serviceToken: 's'.repeat(40),
      issuer: 'https://identity.test/',
      request,
    });
    const id = '12345678-1234-1234-1234-123456789abc';
    const res = response();
    await handlers.stop(
      { user, params: { applicationId: id }, query: {} } as unknown as Parameters<
        typeof handlers.stop
      >[0],
      res as unknown as Response,
    );
    expect(String(request.mock.calls[0][0])).toBe(
      `https://platform.test/internal/v1/workspace/apps/${id}/stop`,
    );
    expect(request.mock.calls[0][1].headers['X-CodeChat-Subject']).toBe('alice');
    await handlers.stop(
      { user, params: { applicationId: '../other' }, query: {} } as unknown as Parameters<
        typeof handlers.stop
      >[0],
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenLastCalledWith(400);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('forwards only the authenticated user identity and returns no service credentials', async () => {
    const request = jest.fn().mockResolvedValue(
      new globalThis.Response(JSON.stringify({ status: 'preparing', storage_gib: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const handlers = createWorkspaceHandlers({
      baseUrl: 'https://platform.test/internal/v1/workspace/',
      serviceToken: 's'.repeat(40),
      issuer: 'https://identity.test/',
      request,
    });
    const res = response();
    await handlers.ensure(
      { user, query: {}, headers: { 'x-codechat-subject': 'bob' } } as unknown as Parameters<
        typeof handlers.ensure
      >[0],
      res as unknown as Response,
    );
    expect(request.mock.calls[0][1].headers['X-CodeChat-Subject']).toBe('alice');
    expect(res.json).toHaveBeenCalledWith({ status: 'preparing', storage_gib: 2 });
  });

  it('rejects missing or mismatching identity before making any request', async () => {
    const request = jest.fn();
    const handlers = createWorkspaceHandlers({
      baseUrl: 'https://platform.test/',
      serviceToken: 's'.repeat(40),
      issuer: 'different',
      request,
    });
    const res = response();
    await handlers.ensure(
      { user } as Parameters<typeof handlers.ensure>[0],
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(request).not.toHaveBeenCalled();
  });

  it('sanitizes upstream failures', async () => {
    const request = jest.fn().mockRejectedValue(new Error('secret debug text'));
    const handlers = createWorkspaceHandlers({
      baseUrl: 'https://platform.test/',
      serviceToken: 's'.repeat(40),
      issuer: 'https://identity.test/',
      request,
    });
    const res = response();
    await handlers.ensure(
      { user, query: {} } as Parameters<typeof handlers.ensure>[0],
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ code: 'workspace_unavailable' });
  });
});
