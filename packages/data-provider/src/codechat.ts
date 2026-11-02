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

export type PersonalSpace = { status: string; storage_gib: number };
export type WorkspaceEntry = { name: string; kind: 'file' | 'directory'; size: number | null };

export type PersonalApplication = {
  id: string;
  project_path: string;
  status: string;
  desired_state: string;
  image: string | null;
  url: string | null;
  error_code: string | null;
  observation: {
    observed_at: string;
    logs: string;
    metrics: {
      cpu_millicores: number;
      cpu_limit_millicores: number;
      cpu_percent: number;
      memory_bytes: number;
      memory_limit_bytes: number;
      memory_percent: number;
    } | null;
  } | null;
};

export async function personalApplicationRequest(
  token: string,
  action: 'list' | 'publish' | 'start' | 'stop' | 'delete',
  value = '',
): Promise<Response> {
  const suffix =
    action === 'publish'
      ? `?path=${encodeURIComponent(value)}`
      : action === 'list'
        ? ''
        : `/${encodeURIComponent(value)}/${action}`;
  const response = await fetch(`/api/user/workspace/apps${suffix}`, {
    method: action === 'list' ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok)
    throw new CodeChatEnvironmentError(response.status === 401 ? 'unauthorized' : 'unavailable');
  return response;
}

export async function personalFileRequest(
  token: string,
  endpoint: 'ensure' | 'directories' | 'file',
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  path = '',
  content?: Blob,
): Promise<Response> {
  const query = endpoint === 'ensure' ? '' : `?path=${encodeURIComponent(path)}`;
  const response = await fetch(`/api/user/workspace/${endpoint}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(content ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: content,
  });
  if (!response.ok)
    throw new CodeChatEnvironmentError(response.status === 401 ? 'unauthorized' : 'unavailable');
  return response;
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
