import { z } from 'zod';
import type { WorkspaceProject } from './codechatProjects';

export const templateCreateInput = z
  .object({ request_id: z.string().uuid(), name: z.string().trim().min(1).max(80) })
  .strict();
export const templateAcceptanceInput = z
  .object({
    source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    checks: z.array(z.enum(['register', 'assign', 'filter', 'preview_boundary'])).max(4),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type TemplateAcceptance = z.infer<typeof templateAcceptanceInput> & { updated_at?: string };
export type TemplateState = {
  project: WorkspaceProject;
  template_id: string;
  state: string;
  database: { id: string; status: string; error_code: string | null } | null;
  acceptance: Partial<TemplateAcceptance>;
  release_acceptance: Partial<TemplateAcceptance> | null;
  release_source_sha256: string | null;
};
export type TemplatePreview = { html: string; source_sha256: string };
export class TemplateError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export async function businessTemplateRequest<T>(
  token: string,
  suffix: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: object,
): Promise<T> {
  const response = await fetch('/api/user/workspace/business-templates' + suffix, {
    method,
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
    throw new TemplateError(typeof value?.code === 'string' ? value.code : 'templates_unavailable');
  }
  return response.json();
}
