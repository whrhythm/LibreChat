import { z } from 'zod';

export const programmingPreferenceSchema = z
  .object({
    conversation_id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    revision: z.number().int().nonnegative(),
    project_path: z.string().max(255),
    strategy: z.enum(['implement', 'plan', 'review']),
    approval: z.enum(['strict', 'workspace_auto']),
    mcp_servers: z
      .array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/))
      .max(10)
      .default([]),
  })
  .strict();
export const programmingDecisionSchema = z
  .object({
    operation_id: z.string().uuid(),
    decision: z.enum(['approve', 'reject']),
  })
  .strict();
export type ProgrammingPreference = z.infer<typeof programmingPreferenceSchema>;
export type ProgrammingMCP = {
  id: string;
  name: string;
  description: string;
  url: string;
  enabled: boolean;
  tools: string[];
  data_notice: string;
  auth?: 'none' | 'platform_bearer' | 'user_bearer';
  permission?: 'read' | 'write';
  credential_configured?: boolean;
  credential_revision?: number;
  credential_stored?: boolean;
};
export const programmingMCPCredentialSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    secret: z.string().min(1).max(4096).nullable(),
  })
  .strict();
export type ProgrammingEvent = {
  sequence: number;
  kind: string;
  at: string;
  text?: string;
  output?: string;
  operation?: string;
  operation_id?: string;
  arguments?: Record<string, string | boolean>;
  path?: string;
  exit_code?: number | null;
  error_code?: string | null;
};
export type ProgrammingTask = {
  id: string;
  conversation_id: string;
  config: ProgrammingPreference & { model: string };
  status: string;
  error_code: string | null;
  events: ProgrammingEvent[];
  pending: { id: string; expires_at: string; decision?: string | null } | null;
};
export class ProgrammingRequestError extends Error {
  constructor(public status: number) {
    super('programming_request_failed');
  }
}
async function request<T>(token: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/user/workspace/agent/' + path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new ProgrammingRequestError(response.status);
  return response.json();
}
export const programmingPreference = (token: string, conversation: string) =>
  request<ProgrammingPreference>(
    token,
    'preferences?conversation_id=' + encodeURIComponent(conversation),
  );
export const saveProgrammingPreference = (token: string, value: ProgrammingPreference) =>
  request<ProgrammingPreference>(token, 'preferences', 'PUT', value);
export const programmingTasks = (token: string) =>
  request<{ tasks: ProgrammingTask[] }>(token, 'tasks');
export const programmingMCP = (token: string) =>
  request<{ servers: ProgrammingMCP[] }>(token, 'mcp');
export const saveProgrammingMCPCredential = (
  token: string,
  id: string,
  value: z.infer<typeof programmingMCPCredentialSchema>,
) =>
  request<{ configured: boolean; revision: number }>(
    token,
    `mcp/${encodeURIComponent(id)}/credential`,
    'PUT',
    value,
  );
export const programmingTask = (token: string, id: string) =>
  request<ProgrammingTask>(token, `tasks/${encodeURIComponent(id)}`);
export const decideProgrammingTask = (
  token: string,
  id: string,
  operation: string,
  decision: 'approve' | 'reject',
) =>
  request<ProgrammingTask>(token, `tasks/${encodeURIComponent(id)}/decision`, 'POST', {
    operation_id: operation,
    decision,
  });
export const cancelProgrammingTask = (token: string, id: string) =>
  request<ProgrammingTask>(token, `tasks/${encodeURIComponent(id)}/cancel`, 'POST');
