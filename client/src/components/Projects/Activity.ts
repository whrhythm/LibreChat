import { useEffect, useRef, useState } from 'react';
import { toUIMessage } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';

export type Status = 'running' | 'done' | 'failed' | 'waiting' | 'stopped';
export type Activity = {
  assistant?: Status;
  knowledge?: Status;
  result?: Status;
  answer?: Status;
  calls: number;
};

const kind = 'starbridge:trial-activity';
const isStatus = (value: unknown): value is Status =>
  ['running', 'done', 'failed', 'waiting', 'stopped'].includes(String(value));

/** Only lifecycle evidence and counts leave the embedded conversation, never tool payloads. */
export function trialActivity(busy: boolean, reply?: TMessage): Activity {
  const activity: Activity = { assistant: busy ? 'running' : 'stopped', calls: 0 };
  let answered = false;
  const seen = new Set<string>();
  const states = new Map<string, Status>();
  for (const part of reply ? toUIMessage(reply).parts : []) {
    if (part.type === 'text' && part.text.trim()) answered = true;
    if (part.type !== 'tool-file_search' || !('toolCallId' in part)) continue;
    answered = false;
    if (!seen.has(part.toolCallId)) activity.calls++;
    seen.add(part.toolCallId);
    if (part.state === 'output-error' || part.state === 'output-denied') {
      activity.knowledge = 'failed';
      activity.result = 'failed';
    } else if (part.state === 'output-available') {
      activity.knowledge = 'done';
      activity.result = 'done';
    } else {
      activity.result = undefined;
      activity.knowledge = part.state === 'approval-requested' ? 'waiting' : 'running';
      if (!busy) activity.knowledge = 'stopped';
    }
    states.set(part.toolCallId, activity.knowledge);
  }
  // Parallel calls may close out of order. Keep the tool active until all calls settle.
  const pending = Array.from(states.values()).find((status) =>
    ['running', 'waiting', 'stopped'].includes(status),
  );
  if (pending) {
    activity.knowledge = pending;
    activity.result = undefined;
  } else if (Array.from(states.values()).includes('failed')) {
    activity.knowledge = 'failed';
    activity.result = 'failed';
  }
  if (busy) {
    if (activity.knowledge === 'running' || activity.knowledge === 'waiting')
      activity.assistant = undefined;
    else if (answered) activity.answer = 'running';
  } else if (reply?.error) {
    activity.assistant = 'failed';
    activity.answer = 'failed';
  } else if (!reply?.unfinished && answered && activity.knowledge !== 'stopped') {
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
        { kind, agent, ...trialActivity(busy, answer) },
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
        ['assistant', 'knowledge', 'result', 'answer'].some(
          (key) => data[key] !== undefined && !isStatus(data[key]),
        )
      )
        return;
      setValue({
        agent,
        status: {
          assistant: data.assistant,
          knowledge: data.knowledge,
          result: data.result,
          answer: data.answer,
          calls: data.calls,
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
