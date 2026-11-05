import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, streamProgrammingTask, ProgrammingRequestError } from 'librechat-data-provider';
import type { ProgrammingTask } from 'librechat-data-provider';

export function newestTask(current: ProgrammingTask | undefined, incoming: ProgrammingTask) {
  return current?.updated_at &&
    incoming.updated_at &&
    Date.parse(current.updated_at) > Date.parse(incoming.updated_at)
    ? current
    : incoming;
}

export function useTaskStream(id: string, userId: string, token: string, enabled: boolean) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const follow = async () => {
      while (!controller.signal.aborted) {
        try {
          await streamProgrammingTask(token, id, controller.signal, (task) => {
            client.setQueryData<ProgrammingTask>(
              [QueryKeys.programmingTask, userId, id],
              (current) => newestTask(current, task),
            );
          });
        } catch (error) {
          if (error instanceof ProgrammingRequestError && error.status < 500) return;
          // The existing task query retains state and reports temporary outages.
        }
        if (!controller.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    };
    void follow();
    return () => controller.abort();
  }, [client, id, userId, token, enabled]);
}
