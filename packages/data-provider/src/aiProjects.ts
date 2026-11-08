import { z } from 'zod';
import type { WorkspaceProject } from './codechatProjects';
import { projectRootPath, MAX_WORKSPACE_PROJECT_NAME_LENGTH } from './codechatProjects';

export const aiProjectCreateInput = z
  .object({
    request_id: z.string().uuid(),
    name: z.string().trim().min(1).max(MAX_WORKSPACE_PROJECT_NAME_LENGTH),
    purpose: z.string().trim().min(1).max(1000),
    path: projectRootPath.optional(),
    native_project_id: z
      .string()
      .regex(/^[0-9a-f]{24}$/)
      .optional(),
  })
  .strict();
export type AIProjectCreateInput = z.infer<typeof aiProjectCreateInput>;
export type AIProject = {
  project: WorkspaceProject;
  agent_id: string;
  state: 'preparing' | 'ready';
  knowledge_state: 'not_configured' | 'ready';
  native_project_id?: string;
};
export class AIProjectError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
async function request<T>(
  token: string,
  suffix = '',
  body?: AIProjectCreateInput | Record<string, never>,
): Promise<T> {
  const response = await fetch('/api/user/workspace/ai-projects' + suffix, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const value = await response.json().catch(() => null);
    throw new AIProjectError(
      typeof value?.code === 'string' ? value.code : 'ai_projects_unavailable',
    );
  }
  return response.json();
}
export const aiProjects = (token: string) =>
  request<{ enabled: boolean; projects: AIProject[] }>(token);
export const createAIProject = (token: string, value: AIProjectCreateInput) =>
  request<AIProject>(token, '', value);
export const resumeAIProject = (token: string, id: string) =>
  request<AIProject>(token, '/' + encodeURIComponent(id) + '/resume', {});
