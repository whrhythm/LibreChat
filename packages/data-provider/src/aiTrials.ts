import { z } from 'zod';

export const personalTrialToolReference = z
  .string()
  .regex(/^action:[A-Za-z0-9_-]{1,64}:[0-9a-f]{64}$/);
export const trialToolReference = z.union([
  z.string().regex(/^mcp:(?:deepwiki|mcp-[0-9a-f]{32}):[A-Za-z0-9_-]{1,64}:[1-9][0-9]{0,8}$/),
  personalTrialToolReference,
]);
export const trialToolSchema = z.object({
  reference: trialToolReference,
  name: z.string().max(64),
  service: z.string().max(80),
  description: z.string().max(500),
  data_notice: z.string().max(500),
  input_schema: z.record(z.string(), z.unknown()),
});
export const reviewedTrialToolName = 'reviewed_tool';

export const trialConfigSchema = z
  .object({
    instructions: z.string().trim().min(1).max(32000),
    model: z.string().min(1).max(200),
    temperature: z.number().min(0).max(2),
    max_output_tokens: z.number().int().min(256).max(16384),
    response_style: z.enum(['grounded', 'support']),
    tool_reference: trialToolReference.nullish(),
    calculator_enabled: z.boolean().optional(),
  })
  .strict();
export const trialCreateSchema = z
  .object({
    request_id: z.string().uuid(),
    expected_digest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export const trialUpdateSchema = z
  .object({
    expected_digest: z.string().regex(/^[0-9a-f]{64}$/),
    config: trialConfigSchema,
  })
  .strict();
export const trialAcceptanceSchema = z
  .object({
    conversation_id: z.string().uuid(),
    outcome: z.enum(['passed', 'failed']),
    note: z.string().trim().min(1).max(2000),
    answer_checked: z.boolean(),
    sources_checked: z.boolean(),
  })
  .strict();
export const trialSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  request_id: z.string().uuid(),
  number: z.number().int().positive(),
  agent_id: z.string().regex(/^agent_trial_[0-9a-f]{32}$/),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  state: z.enum(['preparing', 'ready']),
  knowledge_revision_id: z.string().uuid().nullable(),
  model: z.string(),
  created_at: z.string(),
  acceptance: trialAcceptanceSchema
    .extend({
      message_id: z.string(),
      transcript_digest: z.string(),
      recorded_at: z.string(),
      digest: z.string(),
    })
    .nullable(),
  acceptance_valid: z.boolean(),
  conversation_ids: z.array(z.string().uuid()).optional(),
});
export const trialsSchema = z.object({
  project_id: z.string().uuid(),
  revision: z.number().nullable(),
  config: trialConfigSchema.nullable(),
  digest: z.string().nullable(),
  knowledge_revision_id: z.string().uuid().nullable(),
  unavailable_reason: z.string().nullable(),
  models: z.array(z.string()),
  output_limit: z.number(),
  trials: z.array(trialSchema),
  available_tools: z.array(trialToolSchema).max(12).optional(),
  available_builtin_tools: z.array(z.literal('calculator')).optional(),
});
export type TrialConfig = z.infer<typeof trialConfigSchema>;
export type AITrial = z.infer<typeof trialSchema>;
export type AITrials = z.infer<typeof trialsSchema>;
export class AITrialError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export async function projectTrials<T = AITrials>(
  token: string,
  projectId: string,
  suffix = '',
  body?: object,
): Promise<T> {
  const response = await fetch(
    '/api/user/workspace/ai-projects/' + encodeURIComponent(projectId) + '/trials' + suffix,
    {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const value = await response.json();
  if (!response.ok)
    throw new AITrialError(typeof value?.code === 'string' ? value.code : 'ai_trials_unavailable');
  return value as T;
}
