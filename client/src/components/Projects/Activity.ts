import { useEffect, useRef, useState } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';

type Status = 'running' | 'done' | 'failed';
export type Activity = {
  assistant: Status;
  knowledge?: Status;
};

const kind = 'starbridge:trial-activity';
const isStatus = (value: unknown): value is Status =>
  value === 'running' || value === 'done' || value === 'failed';

export function useSendTrialActivity(agent: string | undefined, busy: boolean, reply?: TMessage) {
  const previous = useRef({ busy: false, reply: '', started: false });
  useEffect(() => {
    if (window.self === window.top || !agent || !/^agent_trial_[a-f0-9]{32}$/.test(agent)) return;
    const observed = previous.current;
    if (busy && !observed.busy) observed.started = true;
    observed.busy = busy;
    const answer = reply?.messageId !== observed.reply ? reply : undefined;
    if (!observed.started) {
      observed.reply = reply?.messageId ?? '';
      return;
    }
    if (!busy && !answer) return;
    const calls = answer?.content?.flatMap((part) =>
      part?.type === ContentTypes.TOOL_CALL &&
      part.tool_call &&
      'name' in part.tool_call &&
      part.tool_call.name === 'file_search'
        ? [part.tool_call]
        : [],
    );
    const call = calls?.at(-1);
    let assistant: Status = 'running';
    if (!busy) {
      assistant = answer?.error || answer?.unfinished ? 'failed' : 'done';
      observed.reply = answer?.messageId ?? '';
      observed.started = false;
    }
    let knowledge: Status | undefined;
    if (call?.runStepStatus === 'failed') knowledge = 'failed';
    else if (call?.runStepStatus === 'completed' || call?.progress === 1) knowledge = 'done';
    else if (call && busy) knowledge = 'running';
    window.parent.postMessage({ kind, agent, assistant, knowledge }, window.location.origin);
  }, [agent, busy, reply]);
}

export function useTrialActivity(agent?: string) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [value, setValue] = useState<{ agent: string; status: Activity }>();
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow)
        return;
      const data = event.data;
      if (!agent || data?.kind !== kind || data.agent !== agent || !isStatus(data.assistant))
        return;
      setValue({
        agent,
        status: {
          assistant: data.assistant,
          knowledge: isStatus(data.knowledge) ? data.knowledge : undefined,
        },
      });
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [agent]);
  return { frame, activity: value?.agent === agent ? value?.status : undefined };
}
