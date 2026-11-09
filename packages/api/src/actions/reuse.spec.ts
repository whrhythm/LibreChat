import { actionDelimiter } from 'librechat-data-provider';
import { getAgentActionSources } from './reuse';

describe('getAgentActionSources', () => {
  const personal = { action_id: 'personal', reusable: true };
  const local = { action_id: 'local' };
  const agent = { id: 'agent', author: 'owner', actions: [`host${actionDelimiter}personal`] };

  it('loads a single account-owned source by reference alongside legacy actions', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce([local, personal])
      .mockResolvedValueOnce([personal]);
    await expect(getAgentActionSources(agent, 'owner', load)).resolves.toEqual([local, personal]);
    expect(load).toHaveBeenCalledWith({ actionId: ['personal'], user: 'owner', reusable: true });
  });

  it('does not load private tools for a different caller or after detaching', async () => {
    const load = jest.fn().mockResolvedValue([local, personal]);
    await expect(getAgentActionSources(agent, 'member', load)).resolves.toEqual([local]);
    await expect(getAgentActionSources({ ...agent, actions: [] }, 'owner', load)).resolves.toEqual([
      local,
    ]);
    expect(load.mock.calls).toEqual([[{ agentId: 'agent' }], [{ agentId: 'agent' }]]);
  });
});
