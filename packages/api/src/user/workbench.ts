import {
  programmingPreferenceSchema,
  programmingDecisionSchema,
  programmingMCPCredentialSchema,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

type Dependencies = {
  baseUrl?: string;
  serviceToken?: string;
  issuer?: string;
  request?: (url: URL, init: RequestInit) => Promise<globalThis.Response>;
};
type WorkbenchRequest = Omit<ServerRequest, 'body'> & { body?: unknown };
type WorkbenchHandler = (req: WorkbenchRequest, res: Response) => Promise<Response>;
type WorkbenchHandlers = Record<
  'preferences' | 'save' | 'tasks' | 'task' | 'decision' | 'cancel' | 'mcp' | 'credential',
  WorkbenchHandler
>;

/** Fixed routes and verified identity only; the browser never chooses a destination or user. */
export function createProgrammingHandlers(deps: Dependencies): WorkbenchHandlers {
  const handler =
    (
      action:
        | 'preferences'
        | 'save'
        | 'tasks'
        | 'task'
        | 'decision'
        | 'cancel'
        | 'mcp'
        | 'credential',
    ) =>
    async (req: WorkbenchRequest, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const user = req.user;
      if (
        user?.provider !== 'openid' ||
        !user.openidId ||
        !user.openidIssuer ||
        !deps.issuer ||
        user.openidIssuer.replace(/\/$/, '') !== deps.issuer.replace(/\/$/, '')
      )
        return res.status(403).json({ code: 'agent_identity_required' });
      if (!deps.baseUrl || !deps.serviceToken || deps.serviceToken.length < 32)
        return res.status(503).json({ code: 'agent_unavailable' });
      let suffix: string = action === 'save' ? 'preferences' : action;
      let body: string | undefined;
      if (action === 'credential') {
        const id =
          req.params && typeof req.params === 'object' && 'serverId' in req.params
            ? req.params.serverId
            : null;
        const parsed = programmingMCPCredentialSchema.safeParse(req.body);
        if (typeof id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(id) || !parsed.success)
          return res.status(400).json({ code: 'agent_invalid_input' });
        suffix = `mcp/${encodeURIComponent(id)}/credential`;
        body = JSON.stringify(parsed.data);
      }
      if (action === 'save' || action === 'decision') {
        const parsed = (
          action === 'save' ? programmingPreferenceSchema : programmingDecisionSchema
        ).safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ code: 'agent_invalid_input' });
        body = JSON.stringify(parsed.data);
      }
      if (action === 'preferences') {
        const conversation = req.query?.conversation_id ?? 'default';
        if (typeof conversation !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(conversation))
          return res.status(400).json({ code: 'agent_invalid_input' });
        suffix += '?conversation_id=' + encodeURIComponent(conversation);
      }
      if (action === 'decision' || action === 'cancel' || action === 'task') {
        const id =
          req.params && typeof req.params === 'object' && 'taskId' in req.params
            ? req.params.taskId
            : null;
        if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))
          return res.status(400).json({ code: 'agent_invalid_input' });
        suffix = `tasks/${encodeURIComponent(id)}${action === 'task' ? '' : '/' + action}`;
      }
      try {
        const url = new URL('agent/' + suffix, deps.baseUrl.replace(/\/?$/, '/'));
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error('configuration');
        const response = await (deps.request ?? fetch)(url, {
          method: {
            save: 'PUT',
            decision: 'POST',
            cancel: 'POST',
            preferences: 'GET',
            tasks: 'GET',
            task: 'GET',
            mcp: 'GET',
            credential: 'PUT',
          }[action],
          headers: {
            'X-CodeChat-Service-Token': deps.serviceToken,
            'X-CodeChat-Subject': user.openidId,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(35000),
        });
        if (!response.ok)
          return res
            .status([400, 403, 404, 409, 422].includes(response.status) ? response.status : 503)
            .json({ code: 'agent_request_failed' });
        return res.status(response.status).json(await response.json());
      } catch {
        return res.status(503).json({ code: 'agent_unavailable' });
      }
    };
  return {
    preferences: handler('preferences'),
    mcp: handler('mcp'),
    credential: handler('credential'),
    save: handler('save'),
    tasks: handler('tasks'),
    task: handler('task'),
    decision: handler('decision'),
    cancel: handler('cancel'),
  };
}
