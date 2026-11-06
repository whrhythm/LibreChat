import { render, screen, fireEvent } from '@testing-library/react';
import type { PersonalApplication, ReleaseProvenance } from 'librechat-data-provider';
import Provenance from './Provenance';
import Delivery from './Delivery';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
const record: ReleaseProvenance = {
  revision: '12345678-1234-4234-8234-123456789abc',
  source_sha256: 'a'.repeat(64),
  image_digest: 'sha256:' + 'b'.repeat(64),
  requested_at: '2026-11-06T00:00:00Z',
  confirmed_at: '2026-11-06T00:01:00Z',
  acceptance_state: 'matched',
  acceptance: {
    task_id: 'task-one',
    conversation_id: '12345678-1234-4234-8234-123456789abc',
    revision: 2,
    counts: { total: 1, passed: 1, pending: 0, changes_requested: 0 },
    goal: 'Private goal',
    criteria: [{ id: 'criterion', text: 'Private business acceptance', result: 'passed' }],
  },
};
it('shows frozen acceptance only for matching code and links the original conversation', () => {
  render(<Provenance record={record} />);
  expect(screen.getByText(/Private business acceptance/)).toBeVisible();
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    '/c/' + record.acceptance!.conversation_id,
  );
  expect(screen.getByText('com_codechat_provenance_revision')).toBeVisible();
});
it.each(['changed', 'unbound', 'pending'] as const)(
  'does not display passed criteria for %s evidence',
  (status) => {
    render(<Provenance record={{ ...record, acceptance_state: status }} />);
    expect(screen.queryByText(/Private business acceptance/)).not.toBeInTheDocument();
    expect(screen.queryByText('com_codechat_acceptance_summary')).not.toBeInTheDocument();
  },
);
it('describes legacy data without claiming source or acceptance evidence', () => {
  render(<Provenance record={null} />);
  expect(screen.getByText('com_codechat_provenance_legacy')).toBeVisible();
  expect(screen.queryByText('com_codechat_provenance_matched')).not.toBeInTheDocument();
});
it('keeps the previous release distinct from a changed failed attempt and omits private text from copying', async () => {
  const copy = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  const app: PersonalApplication = {
    id: 'app',
    project_path: 'demo',
    status: 'failed',
    desired_state: 'running',
    image: 'private-registry',
    url: null,
    error_code: 'build_failed',
    observation: null,
    previous_url: 'https://example.test/',
    cleanup: { status: 'complete', runtime: 'previous_release' },
    release: record,
    attempt: { ...record, revision: 'another-release', acceptance_state: 'changed' },
  };
  render(<Delivery app={app} stale={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_delivery_title' }));
  expect(screen.getByText('com_codechat_provenance_release')).toBeVisible();
  expect(screen.getByText('com_codechat_provenance_attempt')).toBeVisible();
  expect(screen.getByText('com_codechat_provenance_changed')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_delivery_copy' }));
  await screen.findByText('com_codechat_delivery_copied');
  expect(copy.mock.calls[0][0]).toContain('com_codechat_provenance_matched');
  expect(copy.mock.calls[0][0]).not.toMatch(/Private|private-registry/);
});
