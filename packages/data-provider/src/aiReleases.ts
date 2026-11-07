import { z } from 'zod';

/** Reserved server-created runtime entries, never user-authored Agents. */
export function isPublishedAppAgent(id?: string | null): boolean {
  return typeof id === 'string' && /^agent_app_[0-9a-f]{32}$/.test(id);
}

export const publishSchema = z
  .object({
    request_id: z.string().uuid(),
    trial_id: z.string().uuid(),
    expected_digest: z.string().regex(/^[0-9a-f]{64}$/),
    budget_micros: z.number().int().min(1000).max(100000000),
    confirm_sponsor: z.literal(true),
  })
  .strict();
export const releaseAccessSchema = z
  .object({
    expected_revision: z.number().int().positive(),
    enabled: z.boolean(),
    budget_micros: z.number().int().min(1000).max(100000000),
  })
  .strict();
export const releaseMemberSchema = z
  .object({ identifier: z.string().trim().min(1).max(255), enabled: z.boolean() })
  .strict();
export const releaseSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  number: z.number(),
  trial_id: z.string().uuid(),
  digest: z.string(),
  knowledge_revision_id: z.string().nullable(),
  created_at: z.string(),
});
export const releaseListSchema = z.object({
  application: z
    .object({
      project_id: z.string(),
      enabled: z.boolean(),
      active_release_id: z.string().nullable(),
      revision: z.number(),
      budget_micros: z.number(),
      held_micros: z.number(),
      calls: z.array(z.object({ state: z.string(), count: z.number() })),
    })
    .nullable(),
  releases: z.array(releaseSchema),
  members: z.array(z.object({ native_id: z.string(), label: z.string(), enabled: z.boolean() })),
});
export const appEntrySchema = releaseSchema.extend({
  entry_id: z.string().uuid(),
  agent_id: z.string().regex(/^agent_app_[0-9a-f]{32}$/),
  name: z.string(),
  model: z.string(),
  ready: z.boolean(),
  payer: z.literal('creator'),
});
export type AIReleaseList = z.infer<typeof releaseListSchema>;
export type AIAppEntry = z.infer<typeof appEntrySchema>;
export type AIPublish = z.infer<typeof publishSchema>;
export async function applicationSource(
  token: string,
  entryId: string,
  encodedName: string,
): Promise<{ name: string; content: string; revision_id: string }> {
  const response = await fetch(
    '/api/user/workspace/ai-projects/entries/' +
      encodeURIComponent(entryId) +
      '/source?name=' +
      encodedName,
    {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token },
    },
  );
  if (!response.ok) throw new Error('ai_releases_access_denied');
  return response.json();
}
export async function projectReleases<T = AIReleaseList>(
  token: string,
  projectId: string,
  suffix = '',
  body?: object,
): Promise<T> {
  const response = await fetch(
    '/api/user/workspace/ai-projects/' + encodeURIComponent(projectId) + '/releases' + suffix,
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
  const result = await response.json();
  if (!response.ok)
    throw new Error(typeof result?.code === 'string' ? result.code : 'ai_releases_unavailable');
  return result as T;
}
