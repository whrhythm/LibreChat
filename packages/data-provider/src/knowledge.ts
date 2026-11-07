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
