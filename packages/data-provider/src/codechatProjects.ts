import { z } from 'zod';
import type { PersonalApplication } from './codechat';

export const workspaceProjectInput = z
  .object({
    path: z.string().min(1).max(255),
    name: z.string().trim().min(1).max(80),
    goal: z.string().max(1000),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type WorkspaceProjectInput = z.infer<typeof workspaceProjectInput>;
export type WorkspaceProject = WorkspaceProjectInput & {
  id: string;
  created_at: string;
  updated_at: string;
};
export type ProjectContext = WorkspaceProject & {
  tasks: {
    id: string;
    conversation_id: string;
    title: string;
    status: string;
    created_at: string;
    acceptance: {
      revision: number;
      total: number;
      passed: number;
      pending: number;
      changes_requested: number;
    };
  }[];
  tasks_truncated: boolean;
  application: PersonalApplication | null;
};
export type ProjectSource = {
  state: 'same' | 'changed' | 'unbound';
  source_sha256: string;
  release_revision: string | null;
  observed_at: string;
};
export class ProjectRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
async function request<T>(token: string, suffix = '', body?: WorkspaceProjectInput): Promise<T> {
  const response = await fetch('/api/user/workspace/projects' + suffix, {
    method: body ? 'PUT' : 'GET',
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
    throw new ProjectRequestError(
      typeof value?.code === 'string' ? value.code : 'projects_unavailable',
    );
  }
  return response.json();
}
export const workspaceProjects = (token: string) =>
  request<{ projects: WorkspaceProject[] }>(token);
export const saveWorkspaceProject = (token: string, value: WorkspaceProjectInput) =>
  request<WorkspaceProject>(token, '', value);
export const workspaceProject = (token: string, id: string) =>
  request<ProjectContext>(token, '/' + encodeURIComponent(id));
export const workspaceProjectSource = (token: string, id: string) =>
  request<ProjectSource>(token, '/' + encodeURIComponent(id) + '/source');
