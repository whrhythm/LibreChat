import {
  actionDelimiter,
  openapiToFunction,
  validateActionDomain,
  validateAndParseOpenAPISpec,
} from 'librechat-data-provider';
import type { ActionQuery, AppConfig, IAction } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import { blockFilteredActionProjection } from './protection';
import { isActionDomainAllowed } from '../auth/domain';
import { legacyActionDomainEncode } from './update';

type ActionAgent = {
  id: string;
  author?: unknown;
  updatedAt?: unknown;
  actions?: string[];
  tools?: string[];
};

type ActionIdentity = { action_id: string; reusable?: boolean };
type BindingRequest = Request & { user?: { id?: string }; config?: AppConfig };

export function referencedActionIds(agent: Pick<ActionAgent, 'actions'>): string[] {
  return (agent.actions ?? [])
    .map((reference) => reference.split(actionDelimiter)[1])
    .filter(Boolean);
}

export async function getAgentActionSources<T extends ActionIdentity>(
  agent: ActionAgent,
  requester: string | undefined,
  getActions: (query: ActionQuery) => Promise<T[] | null | undefined>,
): Promise<T[]> {
  const own = requester != null && String(agent.author) === requester;
  const actionIds = own ? referencedActionIds(agent) : [];
  const [legacy, reusable] = await Promise.all([
    getActions({ agentId: agent.id }),
    actionIds.length ? getActions({ actionId: actionIds, user: requester, reusable: true }) : [],
  ]);
  return [...(legacy ?? []).filter((action) => !action.reusable), ...(reusable ?? [])];
}

type Dependencies = {
  getAgent: (query: { id: string }) => Promise<ActionAgent | null>;
  getActions: (query: ActionQuery) => Promise<IAction[]>;
  makeActionReusable: (actionId: string, ownerId: string) => Promise<IAction | null>;
  encodeDomain: (domain: string, inverse: boolean) => Promise<string | undefined>;
  updateAgent: (
    query: { id: string; updatedAt?: unknown },
    data: { actions: string[]; tools: string[] },
    options: { updatingUserId: string; forceVersion: boolean },
  ) => Promise<ActionAgent | null>;
};

export function createActionBindingHandler(
  deps: Dependencies,
): (req: BindingRequest, res: Response) => Promise<Response | undefined> {
  return async (req: BindingRequest, res: Response) => {
    const userId = req.user?.id;
    const { agent_id, action_id } = req.params as Record<string, string>;
    const { attached } = req.body ?? {};
    if (!userId || typeof attached !== 'boolean') {
      return res.status(400).json({ message: 'Invalid action binding' });
    }
    const [agent, sources] = await Promise.all([
      deps.getAgent({ id: agent_id }),
      deps.getActions({ actionId: action_id, user: userId }),
    ]);
    const action = sources.find((entry) => entry.agent_id && !entry.assistant_id);
    if (!agent || String(agent.author) !== userId || !action) {
      return res.status(404).json({ message: 'Action or owned agent not found' });
    }
    const bound = referencedActionIds(agent).includes(action_id);
    if (!attached && !action.reusable) {
      return res.status(409).json({ message: 'Action is not reusable' });
    }
    if (bound === attached) {
      return res.json({ actionId: action_id, attached });
    }

    const parsed = validateAndParseOpenAPISpec(action.metadata.raw_spec ?? '');
    const domain = action.metadata.domain;
    if (
      !parsed.spec ||
      !parsed.serverUrl ||
      !validateActionDomain(domain, parsed.serverUrl).isValid
    ) {
      return res.status(409).json({ message: 'Action definition is invalid' });
    }
    const encoded = await deps.encodeDomain(domain, true);
    if (!encoded) {
      return res.status(409).json({ message: 'Action domain is invalid' });
    }
    const { functionSignatures } = openapiToFunction(parsed.spec, true);
    const tools = functionSignatures.map((fn) => `${fn.name}${actionDelimiter}${encoded}`);
    if (attached) {
      if (
        !(await isActionDomainAllowed(
          domain,
          req.config?.actions?.allowedDomains,
          req.config?.actions?.allowedAddresses,
        ))
      ) {
        return res.status(400).json({ message: 'Domain not allowed' });
      }
      if (
        blockFilteredActionProjection(req.config?.filters, res, {
          ...action,
          functions: functionSignatures,
        })
      ) {
        return;
      }
      if (tools.some((tool) => agent.tools?.includes(tool))) {
        return res.status(409).json({ message: 'This agent already has a conflicting tool' });
      }
      if (!action.reusable && !(await deps.makeActionReusable(action_id, userId))) {
        return res.status(409).json({ message: 'Action changed. Try again.' });
      }
    }
    const matchingRef = (ref: string) => ref.split(actionDelimiter)[1] === action_id;
    const legacy = legacyActionDomainEncode(domain);
    const retiredTools = new Set([
      ...tools,
      ...functionSignatures.map((fn) => `${fn.name}${actionDelimiter}${legacy}`),
    ]);
    const updated = await deps.updateAgent(
      { id: agent_id, ...(agent.updatedAt ? { updatedAt: agent.updatedAt } : {}) },
      {
        actions: attached
          ? [...(agent.actions ?? []), `${encoded}${actionDelimiter}${action_id}`]
          : (agent.actions ?? []).filter((ref) => !matchingRef(ref)),
        tools: attached
          ? [...(agent.tools ?? []), ...tools]
          : (agent.tools ?? []).filter((tool) => !retiredTools.has(tool)),
      },
      { updatingUserId: userId, forceVersion: true },
    );
    if (!updated) return res.status(409).json({ message: 'Agent changed. Try again.' });
    return res.json({ actionId: action_id, attached });
  };
}
