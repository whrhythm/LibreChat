import { z } from 'zod';

export const knowledgeImportInput = z
  .object({
    request_id: z.string().uuid(),
    files: z
      .array(
        z.object({ name: z.string().max(124), content: z.string().min(1).max(1048576) }).strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type KnowledgeImportInput = z.infer<typeof knowledgeImportInput>;
export const knowledgeRevisionSchema = z.object({
  id: z.string().uuid(),
  digest: z.string(),
  manifest: z.array(z.object({ name: z.string(), bytes: z.number() })),
  source_bytes: z.number(),
  index_bytes: z.number(),
  chunks: z.number(),
  state: z.enum(['queued', 'indexing', 'ready', 'failed', 'deleting', 'deleted']),
  error_code: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type KnowledgeRevision = z.infer<typeof knowledgeRevisionSchema>;
export const knowledgeListSchema = z.object({
  revisions: z.array(knowledgeRevisionSchema),
  active_revision_id: z.string().uuid().nullable(),
  limits: z.object({ files: z.number(), file_bytes: z.number() }),
});
export type KnowledgeList = z.infer<typeof knowledgeListSchema>;

export const libraryCreateInput = z
  .object({ request_id: z.string().uuid(), name: z.string().trim().min(1).max(80) })
  .strict();
export const libraryRenameInput = z
  .object({ name: z.string().trim().min(1).max(80), expected_version: z.number().int().positive() })
  .strict();
export const libraryEditInput = z
  .object({
    request_id: z.string().uuid(),
    expected_revision_id: z.string().uuid().nullable(),
    action: z.enum(['upsert', 'rename', 'remove']),
    files: knowledgeImportInput.shape.files.optional(),
    name: z.string().min(1).max(124).optional(),
    new_name: z.string().min(1).max(124).optional(),
  })
  .strict();
export const libraryBindInput = z
  .object({
    library_id: z.string().uuid().nullable(),
    expected_library_id: z.string().uuid().nullable(),
  })
  .strict();
export const librarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  state: z.enum(['active', 'deleting', 'deleted']),
  version: z.number().int(),
  head_revision_id: z.string().uuid().nullable(),
  active_revision_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  head: knowledgeRevisionSchema.nullable(),
});
export const libraryDetailSchema = librarySchema.extend({
  limits: z.object({ files: z.number(), file_bytes: z.number(), revisions: z.number() }),
  revisions: z.array(knowledgeRevisionSchema),
  references: z.object({
    projects: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
    fixed_trials: z.number().int(),
  }),
});
export const libraryListSchema = z.object({
  libraries: z.array(librarySchema),
  limits: z.object({ libraries: z.number(), files: z.number(), file_bytes: z.number() }),
});
export type KnowledgeLibrary = z.infer<typeof librarySchema>;
export type LibraryDetail = z.infer<typeof libraryDetailSchema>;
export type LibraryList = z.infer<typeof libraryListSchema>;
export type LibraryEdit = z.infer<typeof libraryEditInput>;
export async function libraryRequest<T = LibraryList>(
  token: string,
  path = '',
  body?: object,
): Promise<T> {
  const response = await fetch('/api/user/workspace/knowledge-libraries' + path, {
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
    const result = await response.json().catch(() => null);
    throw new Error(typeof result?.code === 'string' ? result.code : 'knowledge_unavailable');
  }
  return response.json();
}
export async function projectLibrary(
  token: string,
  projectId: string,
  body?: z.infer<typeof libraryBindInput>,
): Promise<{ library: KnowledgeLibrary | null }> {
  const response = await fetch(
    '/api/user/workspace/ai-projects/' + encodeURIComponent(projectId) + '/knowledge-library',
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
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(typeof result?.code === 'string' ? result.code : 'knowledge_unavailable');
  }
  return response.json();
}
export async function projectKnowledge<T = KnowledgeList>(
  token: string,
  projectId: string,
  suffix = '',
  body?: object,
): Promise<T> {
  const response = await fetch(
    '/api/user/workspace/ai-projects/' + encodeURIComponent(projectId) + '/knowledge' + suffix,
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
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.code === 'string' ? error.code : 'knowledge_unavailable');
  }
  return response.json();
}
