import { reviewedTrialToolName, toUIMessage } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';

const kinds = [
  'submitted',
  'model',
  'call',
  'tool',
  'result',
  'answer',
  'failed',
  'stopped',
] as const;
export type TraceStep = {
  kind: (typeof kinds)[number];
  tool?: 'knowledge' | 'reviewed';
  status?: 'running' | 'done' | 'failed' | 'waiting' | 'stopped';
};

export function isTrace(value: unknown): value is TraceStep[] {
  return (
    Array.isArray(value) &&
    value.length <= 60 &&
    value.every(
      (step) =>
        step &&
        kinds.includes(step.kind) &&
        (step.tool === undefined || step.tool === 'knowledge' || step.tool === 'reviewed') &&
        (step.status === undefined ||
          ['running', 'done', 'failed', 'waiting', 'stopped'].includes(step.status)),
    )
  );
}

/** Native assistant message parts are in display order and carry the actual tool state. */
export function trialTrace(busy: boolean, reply?: TMessage): TraceStep[] {
  const steps: TraceStep[] = [{ kind: 'submitted' }];
  const calls = new Set<string>();
  let observedModel = false;
  let previousWasTool = false;
  let finalText = false;
  for (const part of reply ? toUIMessage(reply).parts : []) {
    const isText = part.type === 'text' && !!part.text.trim();
    const isReasoning = part.type === 'reasoning' && !!part.text.trim();
    const isTool =
      'toolCallId' in part &&
      (part.type === 'tool-file_search' || part.type === 'tool-' + reviewedTrialToolName);
    if (!isText && !isReasoning && !isTool) continue;
    if (steps.length >= 55) break;
    if (!observedModel && !(isTool && previousWasTool)) {
      steps.push({ kind: 'model' });
      observedModel = true;
    }
    previousWasTool = isTool;
    if (isText) finalText = true;
    if (!isTool || calls.has(part.toolCallId)) continue;
    calls.add(part.toolCallId);
    const tool = part.type === 'tool-file_search' ? 'knowledge' : 'reviewed';
    finalText = false;
    steps.push({ kind: 'call', tool });
    if (part.state === 'input-streaming') continue;
    if (part.state === 'output-denied') {
      steps.push({ kind: 'result', tool, status: 'failed' });
      observedModel = false;
      continue;
    }
    if (part.state === 'output-available' || part.state === 'output-error') {
      const status = part.state === 'output-available' ? 'done' : 'failed';
      steps.push({ kind: 'tool', tool, status }, { kind: 'result', tool, status });
      observedModel = false;
      continue;
    }
    let status: TraceStep['status'] = 'stopped';
    if (busy) status = part.state === 'approval-requested' ? 'waiting' : 'running';
    steps.push({ kind: 'tool', tool, status });
  }
  if (reply?.error) steps.push({ kind: 'failed', status: 'failed' });
  else if (!busy && (reply?.unfinished || !finalText))
    steps.push({ kind: 'stopped', status: 'stopped' });
  else if (finalText) steps.push({ kind: 'answer', status: busy ? 'running' : 'done' });
  return steps;
}
