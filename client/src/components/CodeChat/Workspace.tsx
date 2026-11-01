import { useEffect, useState } from 'react';
import { Button, Input } from '@librechat/client';
import { InMemoryWebStorage, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { User } from 'oidc-client-ts';
import type { FormEvent } from 'react';
import type { Identity } from './identity';
import { useAuthContext, useLocalize } from '~/hooks';
import { sameIdentity } from './identity';

type Project = { id: string; name: string };
type Tenant = { id: string };
type Environment = { id: string; storage_gib: number; status: string };
type AuthConfig = { issuer: string; client_id: string; scope: string };
type Connection = {
  token: string;
  tenant: Tenant;
  projects: Project[];
  environment: Environment | null;
};

const configuredOrigin = import.meta.env.VITE_CODECHAT_API_ORIGIN || '';
const sessionStore = new InMemoryWebStorage();
let manager: UserManager | undefined;
let initialization: { owner: string; promise: Promise<Connection | null> } | undefined;

function origin(): string {
  const parsed = new URL(configuredOrigin);
  if (
    parsed.origin !== configuredOrigin ||
    (parsed.protocol !== 'https:' &&
      !(parsed.protocol === 'http:' && parsed.hostname === 'localhost'))
  ) {
    throw new Error('Invalid platform origin');
  }
  return parsed.origin;
}

function failure(status: number): string {
  if (status === 401) {
    return 'unauthorized';
  }
  if (status === 403 || status === 409) {
    return 'limit';
  }
  return 'unavailable';
}

async function platform<T>(path: string, bearer?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${origin()}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(failure(response.status));
  }
  return response.json() as Promise<T>;
}

async function connect(libresession: string): Promise<Connection | null> {
  const identityResponse = await fetch('/api/user/codechat-identity', {
    headers: { Authorization: `Bearer ${libresession}` },
    cache: 'no-store',
  });
  if (!identityResponse.ok) throw new Error('unavailable');
  const identity: Identity = await identityResponse.json();
  const config = await platform<AuthConfig>('/v1/config');
  if (!config.issuer || !config.client_id) throw new Error('unavailable');
  manager ??= new UserManager({
    authority: config.issuer,
    client_id: config.client_id,
    redirect_uri: `${window.location.origin}/codechat`,
    response_type: 'code',
    scope: config.scope,
    userStore: new WebStorageStateStore({ store: sessionStore }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: false,
    loadUserInfo: false,
  });

  let session: User | null;
  const params = new URLSearchParams(window.location.search);
  if (params.has('error')) {
    window.history.replaceState({}, '', '/codechat');
    throw new Error('unavailable');
  }
  if (params.has('code') && params.has('state')) {
    session = await manager.signinRedirectCallback(window.location.href);
    window.history.replaceState({}, '', '/codechat');
  } else {
    session = await manager.getUser();
  }
  if (!session || session.expired) {
    await manager.signinRedirect();
    return null;
  }
  if (!sameIdentity(identity, session.profile)) {
    await manager.removeUser();
    throw new Error('unavailable');
  }
  const tenant = await platform<Tenant>('/v1/me/personal-tenant', session.access_token, {});
  const projects = await platform<Project[]>(
    `/v1/tenants/${tenant.id}/projects`,
    session.access_token,
  );
  let environment: Environment | null = null;
  if (projects.length > 0) {
    try {
      environment = await platform<Environment>(
        `/v1/tenants/${tenant.id}/projects/${projects[0].id}/environment`,
        session.access_token,
      );
    } catch {
      environment = null;
    }
  }
  return { token: session.access_token, tenant, projects, environment };
}

function connectOnce(owner: string, token: string): Promise<Connection | null> {
  if (!initialization || initialization.owner !== owner) {
    const pending = { owner, promise: connect(token) };
    initialization = pending;
    void pending.promise.then(
      () => {
        if (initialization === pending) initialization = undefined;
      },
      () => {
        if (initialization === pending) initialization = undefined;
      },
    );
  }
  return initialization.promise;
}

export default function Workspace() {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (!user?.id || !token)
      return () => {
        active = false;
      };
    setConnection(null);
    setError('');
    void connectOnce(user.id, token)
      .then((value) => {
        if (active) setConnection(value);
      })
      .catch(() => {
        if (active) setError('unavailable');
      });
    return () => {
      active = false;
    };
  }, [user?.id, token, attempt]);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connection || busy) return;
    setBusy(true);
    setError('');
    try {
      const project = await platform<Project>(
        `/v1/tenants/${connection.tenant.id}/projects`,
        connection.token,
        { name },
      );
      setConnection({ ...connection, projects: [...connection.projects, project] });
      setName('');
    } catch (err) {
      if (err instanceof Error && err.message === 'unauthorized') {
        await manager?.removeUser();
        initialization = undefined;
        setConnection(null);
      }
      setError(err instanceof Error && err.message === 'limit' ? 'limit' : 'unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function requestWorkspace(projectId: string) {
    if (!connection || busy) return;
    setBusy(true);
    setError('');
    try {
      const environment = await platform<Environment>(
        `/v1/tenants/${connection.tenant.id}/projects/${projectId}/environment`,
        connection.token,
        {},
      );
      setConnection({ ...connection, environment });
    } catch (err) {
      if (err instanceof Error && err.message === 'unauthorized') {
        await manager?.removeUser();
        initialization = undefined;
        setConnection(null);
      }
      setError(err instanceof Error && err.message === 'limit' ? 'limit' : 'unavailable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="text-text-primary mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{localize('com_codechat_workspace')}</h1>
        <p className="text-text-secondary mt-2">{localize('com_codechat_intro')}</p>
      </div>
      {error && (
        <div role="alert" className="text-text-primary">
          {localize(error === 'limit' ? 'com_codechat_limit' : 'com_codechat_unavailable')}
          {!connection && (
            <Button
              variant="outline"
              onClick={() => {
                initialization = undefined;
                setAttempt((n) => n + 1);
              }}
            >
              {localize('com_codechat_retry')}
            </Button>
          )}
        </div>
      )}
      {!connection && !error && <p role="status">{localize('com_codechat_loading')}</p>}
      {connection && (
        <>
          <form onSubmit={createProject} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              {localize('com_codechat_project_name')}
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={63}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="my-project"
              />
            </label>
            <Button type="submit" disabled={busy}>
              {localize('com_codechat_create')}
            </Button>
          </form>
          {connection.projects.length === 0 ? (
            <p>{localize('com_codechat_empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {connection.projects.map((project) => (
                <li key={project.id} className="border-border-light rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{project.name}</strong>
                    {connection.environment ? (
                      <span className="text-text-secondary">
                        {localize('com_codechat_workspace_status', {
                          size: connection.environment.storage_gib,
                        })}
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          void requestWorkspace(project.id);
                        }}
                      >
                        {localize('com_codechat_request_workspace')}
                      </Button>
                    )}
                  </div>
                  <p className="text-text-secondary">{localize('com_codechat_draft')}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
