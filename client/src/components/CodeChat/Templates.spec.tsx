import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { businessTemplateRequest } from 'librechat-data-provider';
import { TemplateProject } from './Templates';
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'owner' }, token: 'synthetic' }),
  useLocalize: () => (key: string) => key,
}));
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  businessTemplateRequest: jest.fn(),
}));
const request = businessTemplateRequest as jest.Mock;
const current = {
  project: { id: 'project', path: 'support-1' },
  state: 'files_ready',
  database: { status: 'ready' },
  acceptance: {},
  release_acceptance: null,
  release_source_sha256: null,
};
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TemplateProject projectId="project" enabled onApps={jest.fn()} />
    </QueryClientProvider>,
  );
}
beforeEach(() => request.mockReset());
it('previews in an opaque iframe and binds manual checks to the observed source', async () => {
  request.mockImplementation((_token: string, suffix: string) =>
    Promise.resolve(
      suffix.endsWith('/preview')
        ? { html: '<p>sample</p>', source_sha256: 'a'.repeat(64) }
        : current,
    ),
  );
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'com_codechat_template_preview' }));
  const frame = await screen.findByTitle('com_codechat_template_frame');
  expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  expect(frame).not.toHaveAttribute('src');
  const save = screen.getByRole('button', { name: 'com_codechat_template_accept' });
  expect(save).toBeDisabled();
  for (const check of screen.getAllByRole('checkbox')) fireEvent.click(check);
  fireEvent.click(save);
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      'synthetic',
      '/project/acceptance',
      'PUT',
      expect.objectContaining({
        source_sha256: 'a'.repeat(64),
        revision: 0,
        checks: expect.arrayContaining(['register', 'assign', 'filter', 'preview_boundary']),
      }),
    ),
  );
});
it('keeps credentials out of automatic requests and hides publication before the database is ready', async () => {
  request.mockResolvedValue({ ...current, database: { status: 'requested' } });
  mount();
  expect(
    await screen.findByRole('button', { name: 'com_codechat_template_publish' }),
  ).toBeDisabled();
  expect(request.mock.calls.every((call) => !call[1].includes('access'))).toBe(true);
});
