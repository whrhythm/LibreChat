import { createHash } from 'node:crypto';
import {
  AgentCapabilities,
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
};

export type TrialCapabilityDependencies = {
  canUseTrialCapability?: (
    req: TrialRequest,
    capability: AgentCapabilities.actions | AgentCapabilities.tools,
  ) => Promise<boolean>;
  getTrialActions?: (query: ActionQuery) => Promise<StoredAction[]>;
  encodeTrialActionDomain?: (domain: string) => Promise<string | undefined>;
};

async function describe(req: TrialRequest, action: StoredAction): Promise<TrialAction | undefined> {
  const { metadata } = action;
  if (
    !action.reusable ||
    String(action.user) !== req.user?.id ||
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
  const [fn] = openapiToFunction(spec).functionSignatures;
  const digest = createHash('sha256')
    .update(JSON.stringify([metadata.domain, metadata.raw_spec]))
    .digest('hex');
  const reference = `action:${action.action_id}:${digest}`;
  if (!personalTrialToolReference.safeParse(reference).success) return;
  return {
    id: action.action_id,
    domain: metadata.domain,
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
): Promise<TrialAction[]> {
  if (
    !req.user?.id ||
    !deps.getTrialActions ||
    !(await deps.canUseTrialCapability?.(req, AgentCapabilities.actions))
  )
    return [];
  const actionId = reference?.split(':')[1];
  const records = await deps.getTrialActions({ user: req.user.id, reusable: true, actionId });
  const descriptors = await Promise.all(
    records.slice(0, 12).map((action) => describe(req, action)),
  );
  return descriptors.filter(
    (item): item is TrialAction =>
      item != null && (reference == null || item.definition.reference === reference),
  );
}
