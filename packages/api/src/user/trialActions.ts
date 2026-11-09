import { createHash } from 'node:crypto';
import {
  AgentCapabilities,
  createURL,
  openapiToFunction,
  personalTrialToolReference,
  validateActionDomain,
  validateAndParseOpenAPISpec,
} from 'librechat-data-provider';
import type { ActionMetadata, trialToolSchema } from 'librechat-data-provider';
import type { ActionQuery } from '@librechat/data-schemas';
import type { z } from 'zod';
import type { ServerRequest } from '~/types';
import { isActionDomainAllowed } from '~/auth/domain';
import { createSSRFSafeAgents } from '~/auth/agent';

export type TrialRequest = Omit<ServerRequest, 'body'> & { body?: unknown };

type StoredAction = {
  action_id: string;
  user: unknown;
  reusable?: boolean;
  metadata?: ActionMetadata;
};
type TrialAction = {
  definition: z.infer<typeof trialToolSchema>;
  id: string;
  domain: string;
  target: string;
  invoke: (input: Record<string, unknown>, signal?: AbortSignal) => Promise<string>;
};

export type TrialCapabilityDependencies = {
  canUseTrialCapability?: (
    req: TrialRequest,
    capability: AgentCapabilities.actions | AgentCapabilities.tools,
  ) => Promise<boolean>;
  getTrialActions?: (query: ActionQuery) => Promise<StoredAction[]>;
  encodeTrialActionDomain?: (domain: string) => Promise<string | undefined>;
};

async function describe(
  req: TrialRequest,
  action: StoredAction,
  ownerId: string,
): Promise<TrialAction | undefined> {
  const { metadata } = action;
  if (
    !action.reusable ||
    String(action.user) !== ownerId ||
    !metadata?.raw_spec ||
    metadata.raw_spec.length > 64000 ||
    !metadata.domain ||
    metadata.api_key ||
    metadata.oauth_client_id ||
    metadata.oauth_client_secret ||
    (metadata.auth?.type && metadata.auth.type !== 'none')
  )
    return;

  const { spec, serverUrl } = validateAndParseOpenAPISpec(metadata.raw_spec);
  if (!spec || !serverUrl || spec.security?.length) return;
  const server = new URL(serverUrl);
  if (server.username || server.password || server.search || server.hash) return;
  const paths = Object.entries(spec.paths);
  if (paths.length !== 1) return;
  const [path, operations] = paths[0];
  if (!/^\/[A-Za-z0-9_/-]+$/.test(path) || path.includes('//') || !operations) return;
  const operation = operations.get;
  if (
    Object.keys(operations).length !== 1 ||
    !operation?.operationId ||
    !/^[A-Za-z0-9_-]{1,48}$/.test(operation.operationId) ||
    operation.requestBody ||
    operation.security?.length ||
    operation.parameters?.some((param) => !('in' in param) || param.in !== 'query') ||
    !validateActionDomain(metadata.domain, serverUrl).isValid
  )
    return;
  if (
    !(await isActionDomainAllowed(
      metadata.domain,
      req.config?.actions?.allowedDomains,
      req.config?.actions?.allowedAddresses,
    ))
  )
    return;
  const {
    functionSignatures: [fn],
    requestBuilders,
    zodSchemas,
  } = openapiToFunction(spec, true);
  const digest = createHash('sha256')
    .update(JSON.stringify([metadata.domain, metadata.raw_spec]))
    .digest('hex');
  const reference = `action:${action.action_id}:${digest}`;
  if (!personalTrialToolReference.safeParse(reference).success) return;
  return {
    id: action.action_id,
    domain: metadata.domain,
    target: createURL(serverUrl, path),
    invoke: async (input, signal) => {
      const schema = zodSchemas?.[fn.name];
      const properties = fn.parameters.properties;
      if (
        !schema ||
        Object.entries(input).some(
          ([key, value]) =>
            !Object.prototype.hasOwnProperty.call(properties, key) ||
            !['string', 'number', 'boolean'].includes(typeof value),
        ) ||
        Buffer.byteLength(JSON.stringify(input)) > 4096
      )
        throw new Error('Invalid tool arguments');
      const parsed = schema.parse(input) as Record<string, unknown>;
      const agents = createSSRFSafeAgents(req.config?.actions?.allowedAddresses);
      const response = await requestBuilders[fn.name]
        .createExecutor()
        .setParams(parsed)
        .execute({
          ...agents,
          timeout: 10000,
          maxContentLength: 12000,
          signal,
        });
      if (response.status < 200 || response.status >= 300) throw new Error('Tool query failed');
      return (
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      ).slice(0, 12000);
    },
    definition: {
      reference,
      name: fn.name,
      service: spec.info.title.slice(0, 80),
      description: fn.description.slice(0, 500),
      data_notice: '仅在私人试用时调用这个账户工具。服务会收到查询参数。',
      input_schema: { ...fn.parameters },
    },
  };
}

export async function availableTrialActions(
  req: TrialRequest,
  deps: TrialCapabilityDependencies,
  reference?: string,
  ownerId: string | undefined = req.user?.id,
): Promise<TrialAction[]> {
  if (
    !req.user?.id ||
    !ownerId ||
    !deps.getTrialActions ||
    !(await deps.canUseTrialCapability?.(req, AgentCapabilities.actions))
  )
    return [];
  const actionId = reference?.split(':')[1];
  const records = await deps.getTrialActions({ user: ownerId, reusable: true, actionId });
  const descriptors = await Promise.all(
    records.slice(0, 12).map((action) => describe(req, action, ownerId)),
  );
  return descriptors.filter(
    (item): item is TrialAction =>
      item != null && (reference == null || item.definition.reference === reference),
  );
}
