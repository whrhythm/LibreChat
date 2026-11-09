import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

export type ProjectSection = 'overview' | 'assistant' | 'code' | 'files' | 'development';
/** Navigation only: never changes the active conversation or its draft. */
export const projectInspector = atomFamily((_owner: string) =>
  atom<{ projectId: string; section: ProjectSection } | null>(null),
);
