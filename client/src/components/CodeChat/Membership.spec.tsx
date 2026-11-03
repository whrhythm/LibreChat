import { fireEvent, render, screen } from '@testing-library/react';
import type { CapacityAccount } from 'librechat-data-provider';
import Membership from './Membership';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    key + (values ? JSON.stringify(values) : ''),
}));

const plan = {
  id: 'basic',
  version: 'v2',
  name: '基础版',
  amount_minor: 1000,
  currency: 'CNY',
  storage_gib: 4,
  application_limit: 5,
  model_credit_cny_minor: 1000,
  model_credit_usd_micros: 1428571,
  estimated_tokens: 1904761,
  description: '日常聊天与编程',
  features: ['上传、测试、发布'],
};
const account: CapacityAccount = {
  plan,
  mode: 'test',
  plans: [plan],
  active_order: null,
  orders: [],
  applications: { used: 2, limit: 5 },
  storage: {
    budget_bytes: 4294967296,
    pending_capacity_bytes: 0,
    known_used_bytes: null,
    complete: false,
    components: [],
  },
  wallet: {
    status: 'ok',
    remaining_cny_minor: 248,
    remaining_usd_micros: 354914,
    total_tokens: 1914925,
    prompt_tokens: 1836472,
    completion_tokens: 78453,
    estimated_tokens: 473218,
    reference_model: 'real-model',
  },
};

it('shows observed token usage, monetary model credit, storage and app allowance, then chooses the quoted plan', () => {
  const choose = jest.fn();
  render(<Membership account={account} busy={false} choose={choose} />);
  expect(screen.getByText(/com_codechat_member_tokens_used/)).toBeVisible();
  expect(screen.getByText(/com_codechat_member_tokens_split/)).toBeVisible();
  expect(screen.getByText(/com_codechat_member_plan_credit/)).toBeVisible();
  expect(screen.getByText(/com_codechat_member_plan_disk/)).toBeVisible();
  expect(screen.getByText(/com_codechat_member_plan_apps/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /com_codechat_capacity_choose/ }));
  expect(choose).toHaveBeenCalledWith(plan);
});

it('keeps purchase actions disabled during an active operation and explains an exhausted wallet', () => {
  const choose = jest.fn();
  render(
    <Membership
      account={{
        ...account,
        wallet: { status: 'ok', remaining_usd_micros: 0, total_tokens: 1914925 },
      }}
      busy
      choose={choose}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('com_codechat_member_exhausted');
  expect(screen.getByRole('button', { name: /com_codechat_capacity_choose/ })).toBeDisabled();
  expect(choose).not.toHaveBeenCalled();
});
