import { z } from 'zod';
import type { TConversation } from './schemas';
import { EModelEndpoint } from './schemas';

/** Transport names persist in the existing conversation record; they are not model choices. */
export const codechatCapabilitiesSchema = z
  .object({
    enabled: z.boolean().default(false),
    endpoint: z.string().min(1).default('LiteLLM'),
    chatRoute: z.string().min(1).default('codechat-chat'),
    codingRoute: z.string().min(1).default('codechat-coding'),
    chatModel: z.string().optional(),
    codingModel: z.string().optional(),
    allowedModels: z.array(z.string().min(1)).optional(),
    maxContextTokens: z.number().int().min(4096).max(128000).default(32000),
  })
  .refine((value) => value.chatRoute !== value.codingRoute, 'Capability routes must differ');

export type CodeChatCapabilities = z.infer<typeof codechatCapabilitiesSchema>;
export type CodeChatCapability = 'chat' | 'coding';

export type CodeChatModelSettings = {
  chat_model: string;
  coding_model: string;
  models: {
    name: string;
    input_cost_per_token?: number | null;
    output_cost_per_token?: number | null;
  }[];
};

export async function personalModelSettings(token: string): Promise<CodeChatModelSettings> {
  const response = await fetch('/api/user/workspace/models', {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('model_settings_unavailable');
  return response.json();
}

export function codechatCapability(
  conversation: Pick<TConversation, 'model' | 'codechatCapability'> | null | undefined,
  config: CodeChatCapabilities,
): CodeChatCapability {
  if (conversation?.codechatCapability) return conversation.codechatCapability;
  return conversation?.model === config.codingRoute || conversation?.model === 'OpenHands'
    ? 'coding'
    : 'chat';
}

/** Retain the id, message ancestry, project, and workspace when routing the next turn. */
export function withCodeChatCapability(
  conversation: TConversation,
  capability: CodeChatCapability,
  config: CodeChatCapabilities,
  selectedModel?: string,
): TConversation {
  const oldCapability = codechatCapability(conversation, config);
  const real =
    conversation.endpoint === config.endpoint &&
    conversation.model &&
    ![config.chatRoute, config.codingRoute, 'OpenHands'].includes(conversation.model)
      ? conversation.model
      : undefined;
  const actual = (value?: string) =>
    value &&
    ![config.chatRoute, config.codingRoute, 'OpenHands'].includes(value) &&
    (!config.allowedModels || config.allowedModels.includes(value))
      ? value
      : undefined;
  const chatModel =
    oldCapability === 'chat'
      ? (actual(real) ?? actual(conversation.codechatChatModel))
      : actual(conversation.codechatChatModel);
  const codingModel =
    oldCapability === 'coding'
      ? (actual(real) ?? actual(conversation.codechatCodingModel))
      : actual(conversation.codechatCodingModel);
  const chosen =
    selectedModel ??
    (capability === 'chat'
      ? (chatModel ?? config.chatModel ?? config.chatRoute)
      : (codingModel ?? config.codingModel ?? config.codingRoute));
  return {
    ...conversation,
    // LibreChat stores administrator-named custom endpoints in this enum-typed field.
    endpoint: config.endpoint as EModelEndpoint,
    endpointType: EModelEndpoint.custom,
    model: chosen,
    codechatCapability: capability,
    codechatChatModel: capability === 'chat' ? chosen : chatModel,
    codechatCodingModel: capability === 'coding' ? chosen : codingModel,
    agent_id: undefined,
    maxContextTokens: config.maxContextTokens,
    spec: undefined,
  };
}
