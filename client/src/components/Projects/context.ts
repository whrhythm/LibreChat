import type { AITrials } from 'librechat-data-provider';

type Draft = Pick<
  AITrials,
  | 'revision'
  | 'config'
  | 'knowledge_revision_id'
  | 'unavailable_reason'
  | 'available_tools'
  | 'available_builtin_tools'
>;

/** Describe only capabilities confirmed by the authenticated, current draft response. */
export function authoringContext(data: Draft) {
  let knowledgeState = 'unbound';
  if (data.knowledge_revision_id) {
    knowledgeState = data.unavailable_reason ? 'unavailable' : 'available';
  }
  return {
    revision: data.revision,
    model: data.config?.model,
    temperature: data.config?.temperature,
    max_output_tokens: data.config?.max_output_tokens,
    response_style: data.config?.response_style,
    knowledge_revision: data.knowledge_revision_id,
    knowledge_search: {
      tool: 'file_search',
      state: knowledgeState,
      revision_id: data.knowledge_revision_id,
    },
    selected_tool: data.config?.tool_reference,
    selected_builtin_tools: data.config?.calculator_enabled ? ['calculator'] : [],
    available_builtin_tools: data.available_builtin_tools ?? [],
    available_tools: data.available_tools?.map(({ input_schema, ...tool }) => ({
      ...tool,
      parameters: Object.keys(input_schema.properties ?? {}).slice(0, 20),
    })),
    instructions: data.config?.instructions,
  };
}
