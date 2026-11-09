import { fireEvent, render, screen } from '@testing-library/react';
import Sharing from './Sharing';
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
const member = {
  native_id: 'a'.repeat(24),
  label: 'synthetic@example.test',
  enabled: true,
  state: 'active' as const,
  revision: 4,
  budget_micros: 100000,
  expires_at: null,
  spent_micros: 5000,
  pending_micros: 1000,
  held_micros: 6000,
};
it('adjusts a limit with compare-and-swap without sending or resetting historical charges', () => {
  const change = jest.fn();
  render(<Sharing members={[member]} busy={false} change={change} />);
  fireEvent.click(screen.getByRole('button', { name: 'com_sharing_member_options' }));
  fireEvent.click(screen.getByText('com_sharing_adjust'));
  fireEvent.change(screen.getByLabelText('com_sharing_limit'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
  expect(change).toHaveBeenCalledWith({
    suffix: '/policy',
    body: { native_id: member.native_id, expected_revision: 4, budget_micros: 0, expires_at: null },
  });
  expect(screen.getByText(/0.005000/)).toBeVisible();
});
it('allows cancellation of revocation and requires confirmation before revoking', () => {
  const change = jest.fn();
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<Sharing members={[member]} busy={false} change={change} />);
  fireEvent.click(screen.getByRole('button', { name: 'com_sharing_member_options' }));
  fireEvent.click(screen.getByText('com_releases_revoke'));
  expect(change).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByText('com_releases_revoke'));
  expect(change).toHaveBeenCalledWith({
    suffix: '/members',
    body: { identifier: member.native_id, enabled: false, expected_revision: 4 },
  });
  confirm.mockRestore();
});
