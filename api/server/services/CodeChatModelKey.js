// This module is server-only. Neither the service token nor the virtual key is
// returned to a browser or included in errors.
const { updateUserKey } = require('~/models');

async function provisionCodeChatModelKey(user) {
  const url = process.env.CODECHAT_PROVISION_URL;
  if (!url) return;
  const serviceToken = process.env.CODECHAT_SERVICE_TOKEN;
  if (!url.startsWith('https://') || !serviceToken || !user?.tokenset?.access_token ||
      !user.openidId || !user.openidIssuer) {
    throw new Error('CodeChat model setup is unavailable');
  }
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {Authorization: `Bearer ${user.tokenset.access_token}`, 'X-CodeChat-Service-Token': serviceToken},
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
  } catch (_) {
    throw new Error('CodeChat model setup is unavailable');
  }
  if (!response.ok) throw new Error('CodeChat model setup is unavailable');
  let result;
  try { result = await response.json(); } catch (_) { throw new Error('CodeChat model setup is unavailable'); }
  const normalize = value => typeof value === 'string' ? value.replace(/\/$/, '') : '';
  if (result.subject !== user.openidId || normalize(result.issuer) !== normalize(user.openidIssuer) ||
      typeof result.key !== 'string' || !result.key.startsWith('sk-')) {
    throw new Error('CodeChat model identity mismatch');
  }
  // LibreChat custom endpoints store an encrypted JSON object, not a raw key.
  await updateUserKey({userId: user._id, name: 'LiteLLM', value: JSON.stringify({apiKey: result.key})});
}

module.exports = { provisionCodeChatModelKey };
