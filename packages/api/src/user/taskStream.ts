import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import type { Response } from 'express';

const active = new Set(['queued', 'running', 'awaiting_approval', 'cancelling']);

/** Owner-scoped snapshots: reconnecting reads state, never submits or replays a task. */
export async function relayTaskStream(
  url: URL,
  headers: Record<string, string>,
  res: Response,
  request: (url: URL, init: RequestInit) => Promise<globalThis.Response>,
): Promise<Response> {
  const controller = new AbortController();
  const closed = () => controller.abort();
  res.once('close', closed);
  const lifetime = setTimeout(closed, 25000);
  let previous = '';
  try {
    while (!controller.signal.aborted) {
      const response = await request(url, {
        headers,
        redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      });
      if (!response.ok) {
        if (!res.headersSent)
          return res
            .status([403, 404].includes(response.status) ? response.status : 503)
            .json({ code: 'agent_request_failed' });
        break;
      }
      const task = await response.json();
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-store, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
      }
      const snapshot = JSON.stringify(task);
      if (snapshot !== previous) {
        if (!res.write('event: snapshot\ndata: ' + snapshot + '\n\n'))
          await once(res, 'drain', { signal: controller.signal });
        previous = snapshot;
      }
      if (!active.has(task.status)) break;
      // Model deltas are persisted at most four times/sec; one snapshot combines them.
      await delay(task.status === 'running' ? 400 : 1500, undefined, { signal: controller.signal });
    }
  } catch {
    if (!res.headersSent && !controller.signal.aborted)
      return res.status(503).json({ code: 'agent_unavailable' });
  } finally {
    clearTimeout(lifetime);
    controller.abort();
    res.off('close', closed);
  }
  return res.end();
}
