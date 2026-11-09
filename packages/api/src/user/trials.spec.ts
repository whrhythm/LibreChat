import { actionDelimiter } from 'librechat-data-provider';
import type { Response } from 'express';
import { createTrialHandlers, prepareProjectTrial, createTrialConversationGuard } from './trials';
import { availableTrialActions } from './trialActions';
import { getTrialContext } from './trialContext';

const project = '00000000-0000-4000-8000-000000000001';
const trial = '00000000-0000-4000-8000-000000000002';
const conversation = '00000000-0000-4000-8000-000000000003';
const agentId = 'agent_trial_' + trial.replace(/-/g, '');
const user = {
  id: 'a'.repeat(24),
  provider: 'openid',
  openidId: 'alice',
  openidIssuer: 'https://id.test',
};
const record = {
  id: trial,
  project_id: project,
  request_id: project,
  number: 1,
  agent_id: agentId,
  digest: 'a'.repeat(64),
  state: 'ready',
  knowledge_revision_id: null,
  model: 'test',
  created_at: '2026-11-07T00:00:00Z',
  acceptance: null,
  acceptance_valid: false,
};
const snapshot = {
  instructions: 'Original instruction',
  model: { provider: 'LiteLLM', model: 'test', temperature: 0, max_output_tokens: 512 },
  skills: [{ content: 'Original response format' }],
  tools: [],
};
type Input = Parameters<ReturnType<typeof createTrialHandlers>['create']>[0];
const req = (body: object = {}) =>
  ({
    user,
    body,
    params: { projectId: project, trialId: trial },
    config: { config: { aiProjects: { trialsEnabled: true } } },
  }) as unknown as Input;
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
function setup() {
  const request = jest.fn(
    async (_url: URL, _init: RequestInit) =>
      new globalThis.Response(JSON.stringify({ ...record, snapshot })),
  );
  const deps = {
    baseUrl: 'https://pc.test/internal/v1/workspace/',
    serviceToken: 's'.repeat(40),
    issuer: 'https://id.test',
    request,
    getAgent: jest.fn(),
    ensurePrivateTrialAgent: jest.fn(),
    grantPermission: jest.fn(),
    getConvo: jest.fn().mockResolvedValue({ agent_id: agentId }),
    getMessages: jest.fn(),
  };
  return { deps, handlers: createTrialHandlers(deps) };
}
it('withholds reviewed tools and rejects draft binding when the native role cannot use MCP', async () => {
  const { deps } = setup();
  const reference = 'mcp:deepwiki:read_wiki_structure:4';
  const config = {
    instructions: 'Query public documentation',
    model: 'test',
    temperature: 0,
    max_output_tokens: 512,
    response_style: 'grounded',
    tool_reference: reference,
  };
  deps.request.mockResolvedValueOnce(
    new globalThis.Response(
      JSON.stringify({
        project_id: project,
        revision: 1,
        config,
        digest: record.digest,
        knowledge_revision_id: null,
        unavailable_reason: null,
        models: ['test'],
        output_limit: 512,
        trials: [],
        available_tools: [
          {
            reference,
            name: 'read_wiki_structure',
            service: 'DeepWiki',
            description: 'Read documentation',
            data_notice: 'Public repositories only',
            input_schema: { type: 'object' },
          },
        ],
      }),
    ),
  );
  const handlers = createTrialHandlers({ ...deps, canUseReviewedTools: async () => false });
  const listed = response();
  await handlers.list(req(), listed as unknown as Response);
  expect(listed.json).toHaveBeenCalledWith(
    expect.objectContaining({
      available_tools: [],
      unavailable_reason: 'ai_trials_tool_unavailable',
    }),
  );
  const updated = response();
  await handlers.update(
    req({ config, expected_digest: record.digest }),
    updated as unknown as Response,
  );
  expect(updated.status).toHaveBeenCalledWith(403);
  expect(deps.request).toHaveBeenCalledTimes(1);
});
it('uses an immutable snapshot instead of mutable native configuration or browser model flags', async () => {
  const { deps } = setup();
  const params = {
    foregroundRunId: 'answer',
    req: req({
      agent_id: agentId,
      conversationId: conversation,
      model: 'evil',
      ephemeralAgent: { execute_code: true },
    }),
    endpointOption: {
      agent_id: agentId,
      agent: Promise.resolve({
        id: agentId,
        model: 'evil',
        instructions: 'Edited',
        tools: ['execute_code'],
        edges: ['other'],
      }),
    },
  };
  await prepareProjectTrial(params as unknown as Parameters<typeof prepareProjectTrial>[0], deps);
  const fixed = await params.endpointOption.agent;
  expect(fixed).toMatchObject({
    model: 'test',
    tools: [],
    instructions: expect.stringContaining('Original instruction'),
  });
  expect(fixed).not.toHaveProperty('edges');
  expect(fixed.instructions).toContain('创建者私人试用，未正式发布');
  expect(getTrialContext(params.req)).toEqual({ agentId, projectId: project, revisionId: null });
  expect(JSON.parse(deps.request.mock.calls[0]?.[1]?.body as string)).toMatchObject({
    native_owner_id: user.id,
    conversation_id: conversation,
  });
});
it('loads only the owner-approved definition alongside calculator and fixed knowledge', async () => {
  const { deps } = setup();
  const domain = 'https://quote.example.test';
  const raw_spec = JSON.stringify({
    openapi: '3.0.3',
    info: { title: 'Quote', version: '1' },
    servers: [{ url: domain }],
    paths: {
      '/quote': { get: { operationId: 'quote', responses: { 200: { description: 'OK' } } } },
    },
  });
  const owned = {
    action_id: 'personal',
    user: user.id,
    reusable: true,
    metadata: { domain, raw_spec },
  };
  const getTrialActions = jest
    .fn()
    .mockResolvedValue([
      { ...owned, action_id: 'foreign', user: 'b'.repeat(24) },
      { ...owned, action_id: 'credential', metadata: { domain, raw_spec, api_key: 'excluded' } },
      owned,
    ]);
  const transport = {
    ...deps,
    canUseTrialCapability: async () => true,
    getTrialActions,
    encodeTrialActionDomain: async () => 'encoded',
  };
  const request = req({ agent_id: agentId, conversationId: conversation });
  Object.assign(request.config!, { actions: { allowedAddresses: ['quote.example.test:443'] } });
  const listed = await availableTrialActions(request, transport);
  expect(listed.map(({ id }) => id)).toEqual(['personal']);
  expect(listed[0].definition).not.toHaveProperty('domain');
  const fixedTools = ['file_search', 'calculator', listed[0].definition.reference];
  const resolve = () =>
    new globalThis.Response(
      JSON.stringify({
        ...record,
        knowledge_revision_id: project,
        snapshot: { ...snapshot, tools: fixedTools.map((tool_id) => ({ tool_id })) },
      }),
    );
  const params = {
    req: request as Parameters<typeof prepareProjectTrial>[0]['req'],
    foregroundRunId: 'run',
    endpointOption: { agent_id: agentId, agent: Promise.resolve({ id: agentId }) },
  };
  deps.request.mockResolvedValueOnce(resolve());
  await prepareProjectTrial(params, transport);
  expect(await params.endpointOption.agent).toMatchObject({
    actions: ['encoded' + actionDelimiter + 'personal'],
    tools: ['file_search', 'calculator', 'quote' + actionDelimiter + 'encoded'],
  });
  deps.request.mockResolvedValueOnce(resolve());
  getTrialActions.mockResolvedValueOnce([
    { ...owned, metadata: { domain, raw_spec: raw_spec + '\n' } },
  ]);
  await expect(prepareProjectTrial(params, transport)).rejects.toThrow(
    'ai_trials_tool_unavailable',
  );
});
it('leaves ordinary chats untouched and rejects added unversioned context before calling a model', async () => {
  const { deps } = setup();
  const plain = { req: req({ agent_id: 'ordinary' }), endpointOption: { agent_id: 'ordinary' } };
  await prepareProjectTrial(plain as unknown as Parameters<typeof prepareProjectTrial>[0], deps);
  expect(deps.request).not.toHaveBeenCalled();
  await expect(
    prepareProjectTrial(
      {
        req: req({ agent_id: agentId, promptPrefix: 'override' }),
        endpointOption: { agent_id: agentId },
      } as unknown as Parameters<typeof prepareProjectTrial>[0],
      deps,
    ),
  ).rejects.toThrow('ai_trials_override_rejected');
});
it('does not accept forged receipts, unfinished responses, or a conversation from another preview', async () => {
  const { deps, handlers } = setup();
  const body = {
    conversation_id: conversation,
    outcome: 'passed',
    note: 'Checked',
    answer_checked: true,
    sources_checked: true,
  };
  const res = response();
  await handlers.accept(req({ ...body, transcript_digest: 'fake' }), res as unknown as Response);
  expect(res.status).toHaveBeenLastCalledWith(400);
  deps.getMessages.mockResolvedValue([
    { messageId: 'q', isCreatedByUser: true, text: 'Question' },
    {
      messageId: 'a',
      parentMessageId: 'q',
      isCreatedByUser: false,
      unfinished: true,
      text: 'Partial',
    },
  ]);
  await handlers.accept(req(body), res as unknown as Response);
  expect(res.json).toHaveBeenLastCalledWith({ code: 'ai_trials_answer_required' });
  deps.getConvo.mockResolvedValue({ agent_id: 'another' });
  await handlers.accept(req(body), res as unknown as Response);
  expect(res.json).toHaveBeenLastCalledWith({ code: 'ai_trials_session_mismatch' });
  expect(deps.request).not.toHaveBeenCalled();
});
it('derives the receipt from owner-scoped saved messages, never client-provided answer text', async () => {
  const { deps, handlers } = setup();
  deps.getMessages.mockResolvedValue([
    {
      messageId: 'a',
      parentMessageId: 'q',
      isCreatedByUser: false,
      unfinished: false,
      text: 'Answer',
    },
    { messageId: 'q', isCreatedByUser: true, text: 'Question' },
  ]);
  await handlers.accept(
    req({
      conversation_id: conversation,
      outcome: 'passed',
      note: 'Checked',
      answer_checked: true,
      sources_checked: true,
    }),
    response() as unknown as Response,
  );
  expect(deps.getMessages).toHaveBeenCalledWith(
    { user: user.id, conversationId: conversation },
    expect.any(String),
    expect.any(Object),
  );
  expect(JSON.parse(deps.request.mock.calls[0]?.[1]?.body as string)).toMatchObject({
    message_id: 'a',
    transcript_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
});
it('blocks switching an existing fixed trial conversation to another agent', async () => {
  const { deps } = setup();
  const res = response();
  const next = jest.fn();
  await createTrialConversationGuard(deps.getConvo)(
    req({ conversationId: conversation, agent_id: 'other' }) as unknown as Parameters<
      ReturnType<typeof createTrialConversationGuard>
    >[0],
    res as unknown as Response,
    next,
  );
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(409);
});
