import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

/** Space navigation belongs to the signed-in user, never to a chat/model. */
export const spaceDock = atomFamily((_owner: string) => atom(false));
export const spaceDirty = atomFamily((_owner: string) => atom(false));
