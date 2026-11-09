/** Runtime-only context. Browser JSON cannot install or alter a fixed knowledge binding. */
type TrialContext = {
  agentId: string;
  projectId: string;
  revisionId: string | null;
  entryId?: string;
  reviewedTool?: {
    definition: z.infer<typeof trialToolSchema>;
    invoke: (arguments_: Record<string, unknown>, signal?: AbortSignal) => Promise<string>;
  };
};
const contexts = new WeakMap<object, TrialContext>();
export function getTrialContext(request?: object): TrialContext | undefined {
  return request ? contexts.get(request) : undefined;
}
export function setTrialContext(request: object, context: TrialContext): void {
  contexts.set(request, context);
}
export function trialIdFromAgent(id: unknown): string | null {
  if (typeof id !== 'string' || !/^agent_trial_[0-9a-f]{32}$/.test(id)) return null;
  const raw = id.slice(12);
  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    raw.slice(12, 16),
    raw.slice(16, 20),
    raw.slice(20),
  ].join('-');
}

export function appIdFromAgent(id: unknown): string | null {
  if (typeof id !== 'string' || !/^agent_app_[0-9a-f]{32}$/.test(id)) return null;
  return trialIdFromAgent(id.replace('agent_app_', 'agent_trial_'));
}
import type { z } from 'zod';
import type { trialToolSchema } from 'librechat-data-provider';
