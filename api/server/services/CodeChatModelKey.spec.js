jest.mock('~/models', () => ({ updateUserKey: jest.fn() }));
const { updateUserKey } = require('~/models');
const { provisionCodeChatModelKey } = require('./CodeChatModelKey');

describe('CodeChat model provisioning', () => {
  const user = {_id: 'user-a', openidId: 'a', openidIssuer: 'https://id/', tokenset: {access_token: 'access'}};
  beforeEach(() => {
    process.env.CODECHAT_PROVISION_URL = 'https://platform/internal/v1/litellm/key';
    process.env.CODECHAT_SERVICE_TOKEN = 'service-secret';
    global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({subject: 'a', issuer: 'https://id', key: 'sk-test'})});
    updateUserKey.mockReset();
  });
  afterEach(() => { delete process.env.CODECHAT_PROVISION_URL; delete process.env.CODECHAT_SERVICE_TOKEN; delete global.fetch; });
  it('stores the returned key only for the authenticated matching identity', async () => {
    await provisionCodeChatModelKey(user);
    expect(updateUserKey).toHaveBeenCalledWith({userId: 'user-a', name: 'LiteLLM', value: JSON.stringify({apiKey: 'sk-test'})});
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer access');
  });
  it('rejects identity mismatches and upstream failures without storing a key', async () => {
    global.fetch.mockResolvedValueOnce({ok: true, json: async () => ({subject: 'other', issuer: 'https://id', key: 'sk-test'})});
    await expect(provisionCodeChatModelKey(user)).rejects.toThrow('identity mismatch');
    global.fetch.mockRejectedValueOnce(new Error('secret in provider error'));
    await expect(provisionCodeChatModelKey(user)).rejects.toThrow('setup is unavailable');
    expect(updateUserKey).not.toHaveBeenCalled();
  });
});
