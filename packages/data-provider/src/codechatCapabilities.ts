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
    maxContextTokens: z.number().int().min(4096).max(128000).default(32000),
  })
  .refine((value) => value.chatRoute !== value.codingRoute, 'Capability routes must differ');

export type CodeChatCapabilities = z.infer<typeof codechatCapabilitiesSchema>;
export type CodeChatCapability = 'chat' | 'coding';

export function codechatCapability(
  conversation: Pick<TConversation, 'model'> | null | undefined,
  config: CodeChatCapabilities,
): CodeChatCapability {
  return conversation?.model === config.codingRoute || conversation?.model === 'OpenHands'
    ? 'coding'
    : 'chat';
}

/** Retain the id, message ancestry, project, and workspace when routing the next turn. */
export function withCodeChatCapability(
  conversation: TConversation,
  capability: CodeChatCapability,
  config: CodeChatCapabilities,
): TConversation {
  return {
    ...conversation,
    // LibreChat stores administrator-named custom endpoints in this enum-typed field.
    endpoint: config.endpoint as EModelEndpoint,
    endpointType: EModelEndpoint.custom,
    model: capability === 'coding' ? config.codingRoute : config.chatRoute,
    maxContextTokens: config.maxContextTokens,
    spec: undefined,
  };
}
