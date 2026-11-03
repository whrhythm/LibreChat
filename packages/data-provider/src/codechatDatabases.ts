import { z } from 'zod';

export const projectDatabaseInputSchema = z
  .object({
    project_path: z
      .string()
      .min(1)
      .max(255)
      .refine(
        (path) =>
          !path.startsWith('/') &&
          !path.includes('\\') &&
          path.split('/').every((part) => !!part && part !== '.' && part !== '..'),
      ),
  })
  .strict();
export const projectDatabaseDeleteSchema = z
  .object({ confirmation: z.string().min(1).max(255) })
  .strict();
export type ProjectDatabase = {
  id: string;
  project_path: string;
  status: 'requested' | 'provisioning' | 'ready' | 'failed' | 'deleting' | 'deleted';
  error_code: string | null;
  reserved_bytes: number;
  used_bytes: number | null;
  observed_at: string | null;
};
export type ProjectDatabaseList = {
  enabled: boolean;
  budget_bytes: number;
  reserved_bytes: number;
  reservation_bytes: number;
  limit: number;
  quota_mode: 'allocation_and_warning';
  databases: ProjectDatabase[];
};
export class ProjectDatabaseError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
type Action = 'list' | 'create' | 'retry' | 'delete';
type Options = { id?: string; path?: string; confirmation?: string };
export function projectDatabaseRequest(token: string, action: 'list'): Promise<ProjectDatabaseList>;
export function projectDatabaseRequest(
  token: string,
  action: Exclude<Action, 'list'>,
  options: Options,
): Promise<ProjectDatabase>;
export async function projectDatabaseRequest(
  token: string,
  action: Action,
  options: Options = {},
): Promise<ProjectDatabase | ProjectDatabaseList> {
  const suffix =
    action === 'retry' || action === 'delete'
      ? `/${encodeURIComponent(options.id ?? '')}/${action}`
      : '';
  let body: string | undefined;
  if (action === 'create') body = JSON.stringify({ project_path: options.path });
  else if (action === 'delete') body = JSON.stringify({ confirmation: options.confirmation });
  const response = await fetch(`/api/user/workspace/databases${suffix}`, {
    method: action === 'list' ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(action === 'create' || action === 'delete' ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new ProjectDatabaseError(
      typeof result?.code === 'string' ? result.code : 'database_unavailable',
    );
  }
  return response.json();
}
