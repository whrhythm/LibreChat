import { z } from 'zod';
import type { WorkspaceProject } from './codechatProjects';
import {
  assistantProjectTemplateSchema,
  projectRootPath,
  MAX_WORKSPACE_PROJECT_NAME_LENGTH,
} from './codechatProjects';

export const aiProjectCreateInput = z
  .object({
    request_id: z.string().uuid(),
    name: z.string().trim().min(1).max(MAX_WORKSPACE_PROJECT_NAME_LENGTH),
    purpose: z.string().trim().min(1).max(1000),
    path: projectRootPath.optional(),
    template: assistantProjectTemplateSchema.optional(),
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
  state: 'preparing' | 'ready' | 'deleting';
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
  body?: AIProjectCreateInput | DeletionInput,
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

type DeletionInput = {
  confirmation?: string;
  remove_folder?: boolean;
  confirm_code?: boolean;
  retry_failed?: boolean;
};

export type CodeDeletionScope = {
  deployment: boolean;
  domain: string | null;
  database: 'delete' | 'keep' | 'none';
  images: string[];
  image_repository: string | null;
};

export type AIProjectDeletion = { kind?: 'code' } & (
  | {
      state: 'confirm';
      confirmation: string;
      folder: string;
      folder_cleanup?: { files: number; directories: number; bytes: number } | null;
      folder_retention_reason?: 'in_use' | 'unverified' | null;
      knowledge_libraries: number;
      knowledge_revisions: number;
      preserved_libraries: number;
      trials: number;
      releases: number;
      shares: number;
      code?: CodeDeletionScope;
    }
  | { state: 'knowledge'; remaining: number; retrying: boolean }
  | { state: 'native' }
  | { state: 'deployment' | 'database' }
  | { state: 'deleted'; folder_retained?: boolean }
);

export const inspectAIProjectDeletion = (token: string, nativeId: string) =>
  request<AIProjectDeletion>(token, '/' + encodeURIComponent(nativeId) + '/deletion');

export const advanceAIProjectDeletion = (
  token: string,
  nativeId: string,
  input: DeletionInput = {},
) => request<AIProjectDeletion>(token, '/' + encodeURIComponent(nativeId) + '/deletion', input);
