import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { relayTaskStream } from './taskStream';

function output() {
  return Object.assign(new EventEmitter(), {
    headersSent: false,
    frames: [] as string[],
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    flushHeaders() {
      this.headersSent = true;
    },
    write(frame: string) {
      this.frames.push(frame);
      return true;
    },
    end: jest.fn(),
  });
}

it('forwards partial snapshots before the final answer, with read-only owner headers', async () => {
  const res = output();
  const request = jest
    .fn()
    .mockResolvedValueOnce(
      new globalThis.Response(JSON.stringify({ status: 'running', text: 'partial' })),
    )
    .mockImplementationOnce(async () => {
      expect(res.frames.join('')).toContain('partial');
      return new globalThis.Response(JSON.stringify({ status: 'completed', text: 'final' }));
    });
  await relayTaskStream(
    new URL('https://platform.test/task'),
    { 'X-CodeChat-Subject': 'alice' },
    res as unknown as Response,
    request,
  );
  expect(res.frames).toHaveLength(2);
  expect(res.frames[1]).toContain('final');
  expect(request.mock.calls.every(([, init]) => !init.body && !init.method)).toBe(true);
  expect(request.mock.calls[0][1].headers['X-CodeChat-Subject']).toBe('alice');
  expect(res.end).toHaveBeenCalled();
});

it('keeps private data out when owner authorization fails before streaming', async () => {
  const res = output();
  res.status.mockReturnValue(res);
  await relayTaskStream(
    new URL('https://platform.test/task'),
    {},
    res as unknown as Response,
    async () => new globalThis.Response('private details', { status: 404 }),
  );
  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.frames).toEqual([]);
  expect(res.json).toHaveBeenCalledWith({ code: 'agent_request_failed' });
});

it('aborts upstream work when the browser disconnects and does not leak failure text', async () => {
  const res = output();
  const request = jest.fn(async (_url, init) => {
    res.emit('close');
    expect(init.signal.aborted).toBe(true);
    throw new Error('private provider details');
  });
  await relayTaskStream(
    new URL('https://platform.test/task'),
    {},
    res as unknown as Response,
    request,
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(res.frames).toEqual([]);
});
