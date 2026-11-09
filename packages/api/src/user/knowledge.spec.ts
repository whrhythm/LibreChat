import type { Response } from 'express';
import {
  createKnowledgeHandlers,
  createLibraryHandlers,
  primeProjectKnowledge,
  createProjectFileSearchTool,
  checkNativeAgentLibraryWrite,
  createNativeLibraryFileSearchTool,
} from './knowledge';

const id = '00000000-0000-4000-8000-000000000001';
const agent = 'agent_' + id.replace(/-/g, '');
const user = {
  id: 'a'.repeat(24),
  provider: 'openid',
  openidId: 'alice',
  openidIssuer: 'https://identity.test',
};
type Input = Parameters<ReturnType<typeof createKnowledgeHandlers>['import']>[0];
const req = {
  user,
  config: { config: { aiProjects: { knowledgeEnabled: true } } },
} as unknown as Input;
const revision = {
  id,
  digest: 'hash',
  manifest: [],
  source_bytes: 12,
  index_bytes: 2048,
  chunks: 1,
  state: 'queued',
  error_code: null,
  created_at: '2026-11-07',
  updated_at: '2026-11-07',
};
const library = {
  id,
  name: 'Library',
  state: 'active',
  version: 1,
  head_revision_id: null,
  active_revision_id: null,
  created_at: '2026-11-08',
  updated_at: '2026-11-08',
  head: null,
  revisions: [],
  references: { projects: [], fixed_trials: 0 },
  limits: { files: 10, file_bytes: 1048576, revisions: 20 },
};
function setup(value: unknown = revision) {
  const request = jest.fn<Promise<globalThis.Response>, [URL, RequestInit]>(
    async () => new globalThis.Response(JSON.stringify(value)),
  );
  const enableProjectKnowledge = jest.fn().mockResolvedValue(true);
  const deps = {
    baseUrl: 'https://platform.test/internal/v1/workspace/',
    serviceToken: 's'.repeat(40),
    issuer: user.openidIssuer,
    request,
    enableProjectKnowledge,
  };
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return { deps, request, res, handlers: createKnowledgeHandlers(deps) };
}

it('checks an owner library on save and rejects a collaborator changing the binding', async () => {
  const { deps, request } = setup({ ...library, active_revision_id: id });
  expect(await checkNativeAgentLibraryWrite(req, deps, id)).toBeUndefined();
  expect(String(request.mock.calls[0][0])).toMatch('/knowledge-libraries/' + id);
  expect(
    await checkNativeAgentLibraryWrite(req, deps, '', {
      id: 'agent_nativeTest',
      author: 'b'.repeat(24),
      knowledge_library_id: id,
    }),
  ).toMatchObject({ status: 403 });
  expect(request).toHaveBeenCalledTimes(1);
});

it('searches a native owner library alongside attachments and excludes shared users', async () => {
  const { deps, request } = setup({
    revision_id: id,
    sources: [{ name: 'policy.md', line: 3, content: 'fixture result', ordinal: 0, distance: 0.1 }],
  });
  const attached = jest.fn<Promise<[string, unknown]>, [string]>(async () => [
    'attached text',
    undefined,
  ]);
  const fallback = jest.fn(async () => 'fallback');
  const options = {
    req: req as NonNullable<Parameters<typeof createNativeLibraryFileSearchTool>[0]['req']>,
    entity_id: 'agent_nativeTest',
    files: [{}],
  };
  const search = await createNativeLibraryFileSearchTool(
    options,
    deps,
    async () => ({ author: user.id, knowledge_library_id: id }),
    attached,
    fallback,
  );
  if (typeof search === 'string') throw new Error('Library tool not loaded');
  const result = await search.invoke({ query: 'policy' });
  expect(result).toContain('fixture result');
  expect(result).toContain('attached text');
  expect(String(request.mock.calls[0][0])).toMatch('/knowledge-libraries/' + id + '/search');
  expect(
    await createNativeLibraryFileSearchTool(
      options,
      deps,
      async () => ({ author: 'b'.repeat(24), knowledge_library_id: id }),
      attached,
      fallback,
    ),
  ).toBe('fallback');
  expect(request).toHaveBeenCalledTimes(1);
});
it('routes library creation using server identity and rejects owner injection', async () => {
  const { deps, res, request } = setup(library);
  const handlers = createLibraryHandlers(deps);
  await handlers.create(
    { ...req, params: {}, body: { request_id: id, name: 'Library' } } as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(201);
  expect(String(request.mock.calls[0][0])).toBe(
    'https://platform.test/internal/v1/workspace/knowledge-libraries',
  );
  request.mockClear();
  await handlers.create(
    { ...req, params: {}, body: { request_id: id, name: 'Library', owner: 'foreign' } } as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(400);
  expect(request).not.toHaveBeenCalled();
});
it('binds an owned library through the platform and enables native knowledge without granting edit ACLs', async () => {
  const { deps, res, request } = setup({ library });
  const handlers = createLibraryHandlers(deps);
  await handlers.bind(
    {
      ...req,
      params: { projectId: id },
      body: { library_id: id, expected_library_id: null },
    } as Input,
    res as unknown as Response,
  );
  expect(deps.enableProjectKnowledge).toHaveBeenCalledWith(agent, user.id);
  expect(
    JSON.parse((request.mock.calls as unknown as [URL, RequestInit][])[0][1].body as string)
      .native_owner_id,
  ).toBe(user.id);
});
it('stamps the authenticated owner, denies forged body fields and never grants ACLs', async () => {
  const { handlers, request, res, deps } = setup();
  const body = { request_id: id, files: [{ name: 'policy.md', content: 'synthetic' }] };
  await handlers.import(
    { ...req, params: { projectId: id }, body } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(202);
  expect(
    JSON.parse((request.mock.calls as unknown as [URL, RequestInit][])[0][1].body as string)
      .native_owner_id,
  ).toBe(user.id);
  expect(deps.enableProjectKnowledge).toHaveBeenCalledWith(agent, user.id);
  request.mockClear();
  await handlers.import(
    {
      ...req,
      params: { projectId: id },
      body: { ...body, native_owner_id: 'foreign' },
    } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(400);
  expect(request).not.toHaveBeenCalled();
});
it('sanitizes upstream errors and does not retry a write automatically', async () => {
  const { handlers, request, res } = setup();
  request.mockImplementation(
    async () =>
      new globalThis.Response(JSON.stringify({ detail: 'private submitted content' }), {
        status: 500,
      }),
  );
  await handlers.list(
    { ...req, params: { projectId: id } } as unknown as Input,
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenLastCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ code: 'knowledge_unavailable' });
  expect(request).toHaveBeenCalledTimes(1);
});
it('leaves native search untouched for unrelated agents', async () => {
  const fallback = jest.fn().mockResolvedValue({ files: [], toolContext: 'native' });
  await primeProjectKnowledge({ agentId: 'agent_other' }, fallback);
  expect(fallback).toHaveBeenCalledTimes(1);
  createProjectFileSearchTool({ entity_id: 'agent_other' }, setup().deps, fallback);
  expect(fallback).toHaveBeenCalledTimes(2);
});
it('retrieves only the project derived from the authorized agent and pins subsequent calls to the first revision', async () => {
  const { deps, request } = setup({
    revision_id: id,
    digest: 'digest',
    sources: [{ name: 'policy.md', content: 'Seven days', line: 1, ordinal: 0, distance: 0.2 }],
  });
  const search = createProjectFileSearchTool(
    { req: req as never, entity_id: agent, fileCitations: true },
    deps,
    () => null,
  );
  expect(search).not.toBeNull();
  const result = await search!.invoke({ query: 'exchange period' });
  expect(result).toContain('policy.md');
  expect(result).toContain('Anchor: \\ue202turn0file0');
  expect(search!.description).toContain('\\ue202turn0file0');
  await search!.invoke({ query: 'proof' });
  const calls = request.mock.calls as unknown as [URL, RequestInit][];
  expect(String(calls[0][0])).toContain('/' + id + '/knowledge/search');
  expect(JSON.parse(calls[1][1].body as string).revision_id).toBe(id);
});
