import { renderHook, act } from '@testing-library/react';
import { ContentTypes, ToolCallTypes, reviewedTrialToolName } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import { trialActivity, useTrialActivity, useSendTrialActivity } from './Activity';

const agent = 'agent_trial_' + 'a'.repeat(32);
const reply = (content: TMessageContentParts[] = [], extra: Partial<TMessage> = {}): TMessage => ({
  messageId: 'response',
  conversationId: 'conversation',
  parentMessageId: 'request',
  text: '',
  sender: 'assistant',
  isCreatedByUser: false,
  content,
  ...extra,
});
const text: TMessageContentParts = { type: ContentTypes.TEXT, text: 'Answer' };
const tool = (
  id: string,
  state: 'running' | 'completed' | 'failed' = 'running',
  name = 'file_search',
): TMessageContentParts => ({
  type: ContentTypes.TOOL_CALL,
  tool_call: {
    type: ToolCallTypes.TOOL_CALL,
    id,
    name,
    args: '{}',
    ...(state === 'running' ? {} : { runStepStatus: state }),
    ...(state === 'completed' ? { output: 'Synthetic evidence' } : {}),
  },
});

it('allows a direct answer without inventing a tool call', () => {
  expect(trialActivity(true, reply([text]))).toEqual({
    assistant: 'running',
    answer: 'running',
    calls: 0,
  });
  expect(trialActivity(false, reply([text]))).toEqual({
    assistant: 'done',
    answer: 'done',
    calls: 0,
  });
});
it('shows tool execution, result feedback, and subsequent model output', () => {
  expect(trialActivity(true, reply([tool('one')]))).toMatchObject({
    knowledge: 'running',
    assistant: undefined,
    calls: 1,
  });
  expect(trialActivity(true, reply([tool('one', 'completed')]))).toMatchObject({
    knowledge: 'done',
    result: 'done',
    assistant: 'running',
    calls: 1,
  });
  expect(trialActivity(false, reply([tool('one', 'completed'), text]))).toMatchObject({
    knowledge: 'done',
    answer: 'done',
    calls: 1,
  });
});
it('counts successive calls without showing an earlier response as this call result', () => {
  expect(trialActivity(true, reply([tool('one', 'completed'), text, tool('two')]))).toEqual({
    assistant: undefined,
    knowledge: 'running',
    result: undefined,
    calls: 2,
  });
});
it('does not turn failed or cancelled output into success', () => {
  expect(trialActivity(false, reply([tool('one', 'failed')], { error: true }))).toMatchObject({
    knowledge: 'failed',
    result: 'failed',
    answer: 'failed',
  });
  expect(trialActivity(false, reply([text], { unfinished: true }))).toMatchObject({
    assistant: 'stopped',
    answer: 'stopped',
  });
  expect(trialActivity(false, reply([tool('one')]))).toMatchObject({
    knowledge: 'stopped',
    answer: 'stopped',
  });
  expect(trialActivity(false)).toEqual({ assistant: 'stopped', answer: 'stopped', calls: 0 });
});
it('keeps pending parallel calls active when a later call completes first', () => {
  expect(trialActivity(true, reply([tool('one'), tool('two', 'completed')]))).toMatchObject({
    assistant: undefined,
    knowledge: 'running',
    result: undefined,
    calls: 2,
  });
  expect(trialActivity(false, reply([tool('one'), tool('two', 'completed'), text]))).toMatchObject({
    knowledge: 'stopped',
    answer: 'stopped',
    calls: 2,
  });
});
it('does not count unsupported tools or disclose tool payloads', () => {
  const part = tool('one', 'completed');
  const activity = trialActivity(true, reply([part]));
  expect(JSON.stringify(activity)).not.toContain('Synthetic evidence');
  expect(JSON.stringify(activity)).not.toContain('args');
});
it('shows a real reviewed tool result separately from knowledge search', () => {
  expect(
    trialActivity(true, reply([tool('query', 'running', reviewedTrialToolName)])),
  ).toMatchObject({
    tool: 'running',
    toolCalls: 1,
    calls: 0,
  });
  expect(
    trialActivity(true, reply([tool('query', 'completed', reviewedTrialToolName)])),
  ).toMatchObject({
    tool: 'done',
    toolCalls: 1,
    result: 'done',
    assistant: 'running',
    calls: 0,
  });
});
it('accepts only the selected frame, origin, agent and valid status schema', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const { result } = renderHook(() => useTrialActivity(agent));
  result.current.frame.current = iframe;
  const data = { kind: 'starbridge:trial-activity', agent, assistant: 'running', calls: 0 };
  const receive = (overrides: MessageEventInit = {}) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin: location.origin,
          source: iframe.contentWindow,
          ...overrides,
        }),
      );
    });
  receive({ source: window });
  expect(result.current.activity).toBeUndefined();
  receive({ origin: 'https://different.invalid' });
  expect(result.current.activity).toBeUndefined();
  receive({ data: { ...data, agent: 'other' } });
  expect(result.current.activity).toBeUndefined();
  receive({ data: { ...data, calls: -1 } });
  expect(result.current.activity).toBeUndefined();
  receive();
  expect(result.current.activity?.assistant).toBe('running');
  act(() => result.current.resetActivity());
  expect(result.current.activity).toBeUndefined();
  iframe.remove();
});
it('does not replay history as a live run, leak the previous turn, or retain a busy state after interruption', () => {
  const self = jest.spyOn(window, 'self', 'get').mockReturnValue({} as Window & typeof globalThis);
  const send = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  const old = reply([tool('old', 'completed'), text]);
  const { rerender } = renderHook(
    ({ busy, message }) => useSendTrialActivity(agent, busy, message),
    {
      initialProps: { busy: false, message: old },
    },
  );
  expect(send).not.toHaveBeenCalled();
  rerender({ busy: true, message: old });
  expect(send.mock.calls.at(-1)?.[0]).toMatchObject({ assistant: 'running', calls: 0 });
  rerender({ busy: false, message: old });
  expect(send.mock.calls.at(-1)?.[0]).toMatchObject({ assistant: 'stopped', calls: 0 });
  send.mockRestore();
  self.mockRestore();
});
