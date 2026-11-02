import assert from 'node:assert/strict';
import { codeChatEnvironment, CodeChatEnvironmentError } from '../packages/data-provider/src/codechat.ts';

const origin = process.env.CODECHAT_SIM_ORIGIN;
if (!origin) throw new Error('CODECHAT_SIM_ORIGIN required');
const target = `${origin}/platform`;
// The client deliberately accepts an origin only, not an arbitrary path; use
// the mock's header routing on a dedicated port in this test instead.
const proxy = new URL(origin);
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== proxy.origin) throw new Error('Unexpected destination');
  return originalFetch(`${target}${url.pathname}${url.search}`, init);
};
assert.equal(await codeChatEnvironment(origin, 'synthetic-alice', 'tenant', 'project'), null);
const alice = await codeChatEnvironment(origin, 'synthetic-alice', 'tenant', 'project', 'POST');
assert.equal(alice?.mode, 'plan');
assert.equal(alice?.executable, false);
assert.equal((await codeChatEnvironment(origin, 'synthetic-alice', 'tenant', 'project'))?.id, alice?.id);
assert.equal(await codeChatEnvironment(origin, 'synthetic-bob', 'tenant', 'project'), null);
await assert.rejects(codeChatEnvironment(origin, 'bad-token', 'tenant', 'project'), (error: unknown) =>
  error instanceof CodeChatEnvironmentError && error.code === 'unauthorized');
for (const token of ['synthetic-failure', 'synthetic-invalid']) {
  await assert.rejects(codeChatEnvironment(origin, token, 'tenant', 'project'), (error: unknown) =>
    error instanceof CodeChatEnvironmentError && error.code === 'unavailable' && !error.message.includes('internal details'));
}
console.log('PASS: real HTTP client, plan-only request, identity isolation, unauthorized and safe error responses');
