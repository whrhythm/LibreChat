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
export type WorkspaceEntry = {
  name: string;
  kind: 'file' | 'directory';
  size: number | null;
  etag?: string | null;
};

export type PersonalUsage = {
  used_bytes: number;
  quota_bytes: number;
  available_bytes: number;
  physical_available_bytes: number;
  observed_at: string;
  scope: 'personal_volume';
};

export type PersonalApplication = {
  id: string;
  project_path: string;
  status: string;
  desired_state: string;
  image: string | null;
  url: string | null;
  error_code: string | null;
  cleanup?: {
    status: 'pending' | 'complete';
    runtime?: 'previous_release' | 'stopped';
    error_code?: string;
  } | null;
  previous_url?: string | null;
  database?: {
    reserved_bytes: number;
    used_bytes: number | null;
    observed_at: string | null;
  } | null;
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
  let suffix = '';
  if (action === 'publish') suffix = `?path=${encodeURIComponent(value)}`;
  else if (action !== 'list') suffix = `/${encodeURIComponent(value)}/${action}`;
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
  endpoint: 'ensure' | 'directories' | 'file' | 'usage' | 'archive',
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  path = '',
  content?: Blob,
  options?: { overwrite?: boolean; version?: string },
): Promise<Response> {
  const query =
    endpoint === 'ensure' || endpoint === 'usage'
      ? ''
      : `?path=${encodeURIComponent(path)}${options?.overwrite ? '&overwrite=true' : ''}`;
  const response = await fetch(`/api/user/workspace/${endpoint}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.version ? { 'If-Match': options.version } : {}),
      ...(content ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: content,
  });
  if (!response.ok && response.status === 409 && endpoint === 'file')
    throw new PersonalFileError('conflict');
  if (!response.ok && response.status === 507) throw new PersonalFileError('full');
  if (!response.ok)
    throw new CodeChatEnvironmentError(response.status === 401 ? 'unauthorized' : 'unavailable');
  return response;
}

export class PersonalFileError extends Error {
  constructor(public readonly code: 'conflict' | 'full') {
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
