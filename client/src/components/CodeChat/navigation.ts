import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { AITrial, TrialConfig } from 'librechat-data-provider';

/** Survives responsive panel remounts; never persisted to disk or shared across users. */
export const selectedProject = atomFamily((_owner: string) => atom(''));
export const projectSection = atomFamily((_scope: string) => atom('preview'));
export const trialEditor = atomFamily((_scope: string) =>
  atom({
    expanded: false,
    config: null as TrialConfig | null,
    baseDigest: '',
    request: null as { request_id: string; expected_digest: string } | null,
    acceptance: null as {
      trial: AITrial;
      note: string;
      answer: boolean;
      sources: boolean;
      conversationId?: string;
    } | null,
  }),
);
export const discardProjectEdits = atomFamily((owner: string) =>
  atom(null, (get, set) => {
    const id = get(selectedProject(owner));
    if (!id) return;
    set(trialEditor(owner + ':' + id), (current) => ({
      ...current,
      config: null,
      acceptance: null,
    }));
  }),
);
