/** The API record may be a plan; it is not evidence that a disk exists. */
export type CodeChatEnvironment = {
  id: string;
  status: string;
  mode: string;
  executable: boolean;
  storage_gib: number;
};

export class CodeChatEnvironmentError extends Error {
  constructor(public readonly code: 'unauthorized' | 'unavailable') {
    super(code);
  }
}

export async function codeChatEnvironment(
  origin: string,
  token: string,
  tenantId: string,
  projectId: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<CodeChatEnvironment | null> {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
  ) {
    throw new CodeChatEnvironmentError('unavailable');
  }
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(projectId)}/environment`;
  const response = await fetch(`${url.origin}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'omit',
    cache: 'no-store',
  });
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok)
    throw new CodeChatEnvironmentError(response.status === 401 ? 'unauthorized' : 'unavailable');
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('id' in data) ||
    typeof data.id !== 'string' ||
    !('status' in data) ||
    typeof data.status !== 'string' ||
    !('mode' in data) ||
    typeof data.mode !== 'string' ||
    !('executable' in data) ||
    typeof data.executable !== 'boolean' ||
    !('storage_gib' in data) ||
    typeof data.storage_gib !== 'number' ||
    !Number.isFinite(data.storage_gib)
  ) {
    throw new CodeChatEnvironmentError('unavailable');
  }
  return data as CodeChatEnvironment;
}
