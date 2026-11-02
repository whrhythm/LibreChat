import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@librechat/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InMemoryWebStorage, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { codeChatEnvironment, CodeChatEnvironmentError, QueryKeys } from 'librechat-data-provider';
import type { User } from 'oidc-client-ts';
import type { FormEvent } from 'react';
import type { Identity } from './identity';
import { useAuthContext, useLocalize } from '~/hooks';
import { sameIdentity } from './identity';
import SpaceStatus from './SpaceStatus';

type Project = { id: string; name: string };
type Tenant = { id: string };
type AuthConfig = { issuer: string; client_id: string; scope: string };
type Connection = { owner: string; token: string; tenant: Tenant; projects: Project[] };

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
    if (response.status === 401) throw new Error('unauthorized');
    if (response.status === 403 || response.status === 409) throw new Error('limit');
    throw new Error('unavailable');
  }
  return response.json() as Promise<T>;
}

async function connect(owner: string, libresession: string): Promise<Connection | null> {
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
  return { owner, token: session.access_token, tenant, projects };
}

function connectOnce(owner: string, token: string): Promise<Connection | null> {
  if (!initialization || initialization.owner !== owner) {
    const pending = { owner, promise: connect(owner, token) };
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
  const ownerRef = useRef(user?.id);
  ownerRef.current = user?.id;
  const queryClient = useQueryClient();
  const ownedConnection = connection?.owner === user?.id ? connection : null;
  const project = ownedConnection?.projects[0];
  const spaceKey = [
    QueryKeys.codechatEnvironment,
    user?.id,
    ownedConnection?.tenant.id,
    project?.id,
  ];
  const space = useQuery({
    queryKey: spaceKey,
    queryFn: () =>
      codeChatEnvironment(
        origin(),
        ownedConnection!.token,
        ownedConnection!.tenant.id,
        project!.id,
      ),
    enabled: !!ownedConnection && !!project,
    retry: false,
    staleTime: 0,
  });
  const requestSpace = useMutation({
    mutationFn: (request: { owner: string; token: string; tenantId: string; projectId: string }) =>
      codeChatEnvironment(origin(), request.token, request.tenantId, request.projectId, 'POST'),
    onSuccess: (data, request) =>
      queryClient.setQueryData(
        [QueryKeys.codechatEnvironment, request.owner, request.tenantId, request.projectId],
        data,
      ),
    onError: async (err, request) => {
      if (
        !(err instanceof CodeChatEnvironmentError) ||
        err.code !== 'unauthorized' ||
        ownerRef.current !== request.owner
      )
        return;
      await manager?.removeUser().catch(() => {});
      if (ownerRef.current === request.owner) {
        initialization = undefined;
        setConnection(null);
        setError('unavailable');
      }
    },
    retry: false,
  });

  function retrySpace() {
    if (!(space.error instanceof CodeChatEnvironmentError) || space.error.code !== 'unauthorized') {
      void space.refetch();
      return;
    }
    const owner = ownedConnection?.owner;
    void manager
      ?.removeUser()
      .catch(() => {})
      .then(() => {
        if (owner && ownerRef.current === owner) {
          initialization = undefined;
          setConnection(null);
          setAttempt((n) => n + 1);
        }
      });
  }

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
    if (!ownedConnection || busy) return;
    setBusy(true);
    setError('');
    try {
      const project = await platform<Project>(
        `/v1/tenants/${ownedConnection.tenant.id}/projects`,
        ownedConnection.token,
        { name },
      );
      setConnection((current) =>
        current?.owner === ownedConnection.owner
          ? { ...current, projects: [...current.projects, project] }
          : current,
      );
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

  return (
    <main className="text-text-primary mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{localize('com_codechat_workspace')}</h1>
        <p className="text-text-secondary mt-2">{localize('com_codechat_intro')}</p>
      </div>
      {error && (
        <div role="alert" className="text-text-primary">
          {localize(error === 'limit' ? 'com_codechat_limit' : 'com_codechat_unavailable')}
          {!ownedConnection && (
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
      {!ownedConnection && !error && <p role="status">{localize('com_codechat_loading')}</p>}
      {ownedConnection && (
        <>
          <SpaceStatus
            hasProject={!!project}
            loading={space.isFetching}
            failed={space.isError}
            environment={space.data}
            requesting={requestSpace.isLoading}
            requestFailed={requestSpace.isError}
            onRetry={retrySpace}
            onRequest={() => {
              if (project)
                requestSpace.mutate({
                  owner: ownedConnection.owner,
                  token: ownedConnection.token,
                  tenantId: ownedConnection.tenant.id,
                  projectId: project.id,
                });
            }}
          />
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
          {ownedConnection.projects.length === 0 ? (
            <p>{localize('com_codechat_empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {ownedConnection.projects.map((project) => (
                <li key={project.id} className="border-border-light rounded-lg border p-4">
                  <strong>{project.name}</strong>
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
