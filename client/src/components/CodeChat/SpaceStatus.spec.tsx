import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import SpaceStatus from './SpaceStatus';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('@librechat/client', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

const base = {
  hasProject: true,
  loading: false,
  failed: false,
  environment: null,
  requesting: false,
  requestFailed: false,
  onRetry: jest.fn(),
  onRequest: jest.fn(),
};

describe('personal space status', () => {
  it('asks for a project before offering a space request', () => {
    render(<SpaceStatus {...base} hasProject={false} />);
    expect(screen.getByText('com_codechat_space_needs_project')).toBeInTheDocument();
    expect(screen.queryByText('com_codechat_space_request')).not.toBeInTheDocument();
  });

  it('shows loading and a retryable error', () => {
    const { rerender } = render(<SpaceStatus {...base} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('com_codechat_space_checking');
    rerender(<SpaceStatus {...base} failed />);
    fireEvent.click(screen.getByText('com_codechat_retry'));
    expect(base.onRetry).toHaveBeenCalledTimes(1);
  });

  it('makes clear that a request does not create storage', () => {
    render(<SpaceStatus {...base} />);
    expect(screen.getByText('com_codechat_space_request_notice')).toBeInTheDocument();
    fireEvent.click(screen.getByText('com_codechat_space_request'));
    expect(base.onRequest).toHaveBeenCalledTimes(1);
  });

  it('never treats a plan as an available disk', () => {
    const environment = {
      id: 'env',
      status: 'ready',
      mode: 'plan',
      executable: false,
      storage_gib: 2,
    };
    render(<SpaceStatus {...base} environment={environment} />);
    expect(screen.getByText('com_codechat_space_plan_notice')).toBeInTheDocument();
    expect(screen.queryByText('com_codechat_space_ready')).not.toBeInTheDocument();
  });

  it('requires an executable ready status before showing the space as ready', () => {
    const environment = {
      id: 'env',
      status: 'ready',
      mode: 'apply',
      executable: false,
      storage_gib: 2,
    };
    const { rerender } = render(<SpaceStatus {...base} environment={environment} />);
    expect(screen.queryByText('com_codechat_space_ready')).not.toBeInTheDocument();
    rerender(
      <SpaceStatus
        {...base}
        environment={{ ...environment, executable: true, status: 'provisioning' }}
      />,
    );
    expect(screen.getByText('com_codechat_space_pending')).toBeInTheDocument();
    rerender(<SpaceStatus {...base} environment={{ ...environment, executable: true }} />);
    expect(screen.getByText('com_codechat_space_ready')).toBeInTheDocument();
  });
});
