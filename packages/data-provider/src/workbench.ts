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
  stream_id?: string;
  phase?: string;
};
export type ProgrammingTask = {
  id: string;
  conversation_id: string;
  config: ProgrammingPreference & { model: string };
  status: string;
  error_code: string | null;
  events: ProgrammingEvent[];
  pending: { id: string; expires_at: string; decision?: string | null } | null;
  updated_at?: string;
  acceptance?: {
    revision: number;
    total: number;
    passed: number;
    pending: number;
    changes_requested: number;
  };
};

export const acceptanceSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    goal: z.string().max(4000),
    criteria: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            text: z.string().trim().min(1).max(400),
            result: z.enum(['pending', 'passed', 'changes_requested']),
          })
          .strict(),
      )
      .max(12),
    note: z.string().max(1000),
  })
  .strict()
  .refine((value) => new Set(value.criteria.map((item) => item.id)).size === value.criteria.length);
export type AcceptanceInput = z.infer<typeof acceptanceSchema>;
export type TaskAcceptance = AcceptanceInput & {
  source_sha256?: string | null;
  task_id: string;
  project_path: string;
  task_status: string;
  request: { text: string; truncated: boolean } | null;
  updated_at: string | null;
};
export const taskAcceptance = (token: string, id: string) =>
  request<TaskAcceptance>(token, `tasks/${encodeURIComponent(id)}/acceptance`);
export const saveTaskAcceptance = (token: string, id: string, body: AcceptanceInput) =>
  request<TaskAcceptance>(token, `tasks/${encodeURIComponent(id)}/acceptance`, 'PUT', body);

/** A stream is a replaceable projection of one task, not a command channel. */
export async function streamProgrammingTask(
  token: string,
  id: string,
  signal: AbortSignal,
  update: (task: ProgrammingTask) => void,
): Promise<void> {
  const response = await fetch(
    '/api/user/workspace/agent/tasks/' + encodeURIComponent(id) + '/stream',
    {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    },
  );
  if (!response.ok) throw new ProgrammingRequestError(response.status);
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
    throw new ProgrammingRequestError(503);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 8 * 1024 * 1024) throw new ProgrammingRequestError(503);
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (!frame.startsWith('event: snapshot\n')) continue;
        const line = frame.split('\n').find((part) => part.startsWith('data: '));
        if (!line) continue;
        const task: ProgrammingTask = JSON.parse(line.slice(6));
        if (task.id !== id || !Array.isArray(task.events)) throw new ProgrammingRequestError(503);
        update(task);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
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
