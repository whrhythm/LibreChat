import { z } from 'zod';

export const versionInputSchema = z
  .object({
    path: z.string().min(1).max(255),
    name: z.string().trim().min(1).max(80),
  })
  .strict();
export const versionRestoreSchema = z
  .object({
    target: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => !/[/\\]/.test(value) && !['.', '..'].includes(value)),
  })
  .strict();

export type ProjectVersion = {
  id: string;
  path: string;
  name: string;
  digest: string;
  stored_bytes: number;
  source_bytes: number;
  created_at: string;
  files: number;
  excluded: string[];
};
export type ProjectRestore = {
  id: string;
  version_id: string;
  target: string;
  status: 'pending' | 'unknown' | 'blocked' | 'ready';
  request_key: string;
};
export type VersionHistory = {
  versions: ProjectVersion[];
  restores: ProjectRestore[];
  used_bytes: number;
  limit: number;
  max_source_bytes: number;
  excluded: string[];
};
export type VersionDiff = {
  version: ProjectVersion;
  unchanged: number;
  changes: {
    path: string;
    change: 'added' | 'removed' | 'modified';
    diff: string | null;
    truncated: boolean;
  }[];
};
export class VersionError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export async function versionRequest<T>(
  token: string,
  suffix: string,
  method = 'GET',
  body?: object,
  key?: string,
): Promise<T> {
  const response = await fetch(`/api/user/workspace/versions${suffix}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const value = await response.json().catch(() => null);
    throw new VersionError(
      typeof value?.code === 'string' && /^versions_[a-z_]+$/.test(value.code)
        ? value.code
        : 'versions_unavailable',
    );
  }
  return response.json();
}
