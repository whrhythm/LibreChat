import { useEffect, useRef, useState } from 'react';
import { reviewedTrialToolName } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { TraceStep } from './Trace';
import { isTrace, trialParts, trialTrace } from './Trace';

export type Status = 'running' | 'done' | 'failed' | 'waiting' | 'stopped';
export type Activity = {
  assistant?: Status;
  knowledge?: Status;
  tool?: Status;
  result?: Status;
  answer?: Status;
  calls: number;
  toolCalls?: number;
  trace?: TraceStep[];
};

const kind = 'starbridge:trial-activity';
const isStatus = (value: unknown): value is Status =>
  ['running', 'done', 'failed', 'waiting', 'stopped'].includes(String(value));

function summarize(states: Map<string, Status>): Status | undefined {
  const values = [...states.values()];
  return (
    values.find((status) => ['running', 'waiting', 'stopped'].includes(status)) ??
    (values.includes('failed') ? 'failed' : values[0])
  );
}

/** Only lifecycle evidence and counts leave the embedded conversation, never tool payloads. */
export function trialActivity(busy: boolean, reply?: TMessage): Activity {
  const activity: Activity = { assistant: busy ? 'running' : 'stopped', calls: 0 };
  let answered = false;
  const searches = new Map<string, Status>();
  const tools = new Map<string, Status>();
  for (const part of reply ? trialParts(reply) : []) {
    if (part.type === 'text' && part.text.trim()) answered = true;
    if (!('toolCallId' in part)) continue;
    const states = part.type === 'tool-file_search' ? searches : tools;
    if (states === tools && part.type !== 'tool-' + reviewedTrialToolName) continue;
    answered = false;
    let state: Status;
    if (part.state === 'output-error' || part.state === 'output-denied') {
      state = 'failed';
    } else if (part.state === 'output-available') {
      state = 'done';
    } else {
      state = part.state === 'approval-requested' ? 'waiting' : 'running';
      if (!busy) state = 'stopped';
    }
    states.set(part.toolCallId, state);
  }
  // Parallel calls may close out of order. Keep the tool active until all calls settle.
  activity.calls = searches.size;
  if (searches.size) activity.knowledge = summarize(searches);
  if (tools.size) {
    activity.tool = summarize(tools);
    activity.toolCalls = tools.size;
  }
  const states = [activity.knowledge, activity.tool];
  const pending = states.some((state) => state === 'running' || state === 'waiting');
  const stopped = states.includes('stopped');
  if (pending || stopped) {
    activity.result = undefined;
  } else {
    if (states.includes('failed')) activity.result = 'failed';
    else if (states.includes('done')) activity.result = 'done';
  }
  if (busy) {
    if (pending) activity.assistant = undefined;
    else if (answered) activity.answer = 'running';
  } else if (reply?.error) {
    activity.assistant = 'failed';
    activity.answer = 'failed';
  } else if (!reply?.unfinished && answered && !stopped) {
    activity.assistant = 'done';
    activity.answer = 'done';
  } else {
    activity.answer = 'stopped';
  }
  return activity;
}

export function useSendTrialActivity(agent: string | undefined, busy: boolean, reply?: TMessage) {
  const previous = useRef<{
    agent?: string;
    busy: boolean;
    active: boolean;
    baseline?: TMessage;
    idle?: TMessage;
  }>({ busy: false, active: false });
  useEffect(() => {
    if (window.self === window.top || !agent || !/^agent_trial_[a-f0-9]{32}$/.test(agent)) return;
    if (previous.current.agent !== agent) previous.current = { agent, busy: false, active: false };
    const observed = previous.current;
    if (busy && !observed.busy) {
      observed.active = true;
      observed.baseline = observed.idle;
    }
    observed.busy = busy;
    if (observed.active) {
      // Regeneration can keep its message ID. Compare immutable message references.
      const answer = reply !== observed.baseline ? reply : undefined;
      window.parent.postMessage(
        { kind, agent, ...trialActivity(busy, answer), trace: trialTrace(busy, answer) },
        window.location.origin,
      );
      if (!busy) observed.active = false;
    }
    if (!busy) observed.idle = reply;
  }, [agent, busy, reply]);
}

export function useTrialActivity(agent?: string) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [value, setValue] = useState<{ agent: string; status: Activity }>();
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow)
        return;
      const data = event.data;
      if (
        !agent ||
        data?.kind !== kind ||
        data.agent !== agent ||
        !Number.isSafeInteger(data.calls) ||
        data.calls < 0 ||
        (data.trace !== undefined && !isTrace(data.trace)) ||
        (data.toolCalls !== undefined &&
          (!Number.isSafeInteger(data.toolCalls) || data.toolCalls < 0)) ||
        ['assistant', 'knowledge', 'tool', 'result', 'answer'].some(
          (key) => data[key] !== undefined && !isStatus(data[key]),
        )
      )
        return;
      setValue({
        agent,
        status: {
          assistant: data.assistant,
          knowledge: data.knowledge,
          tool: data.tool,
          result: data.result,
          answer: data.answer,
          calls: data.calls,
          toolCalls: data.toolCalls,
          trace: data.trace,
        },
      });
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [agent]);
  return {
    frame,
    activity: value?.agent === agent ? value?.status : undefined,
    resetActivity: () => setValue(undefined),
  };
}
