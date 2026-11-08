import { authoringContext } from './context';

const config = {
  instructions: 'Preserve manual changes',
  model: 'allowed-model',
  temperature: 0.4,
  max_output_tokens: 2048,
  response_style: 'grounded' as const,
};

it('describes the saved parameters and confirmed knowledge capability to the authoring model', () => {
  expect(
    authoringContext({
      config,
      revision: 3,
      knowledge_revision_id: 'ready-revision',
      unavailable_reason: null,
    }),
  ).toMatchObject({
    revision: 3,
    temperature: 0.4,
    instructions: config.instructions,
    knowledge_search: { tool: 'file_search', state: 'available', revision_id: 'ready-revision' },
  });
});
it('does not infer availability for missing or unavailable knowledge', () => {
  expect(
    authoringContext({ config, revision: 3, knowledge_revision_id: null, unavailable_reason: null })
      .knowledge_search.state,
  ).toBe('unbound');
  expect(
    authoringContext({
      config,
      revision: 3,
      knowledge_revision_id: 'pending',
      unavailable_reason: 'knowledge_unavailable',
    }).knowledge_search.state,
  ).toBe('unavailable');
});
it('keeps new projects empty without inventing tools or configuration', () => {
  const context = authoringContext({
    config: null,
    revision: null,
    knowledge_revision_id: null,
    unavailable_reason: null,
  });
  expect(context.instructions).toBeUndefined();
  expect(context.knowledge_search.state).toBe('unbound');
});
