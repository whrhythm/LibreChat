/* eslint-disable i18next/no-literal-string -- Synthetic navigation fixtures. */
import { useState } from 'react';
import { Bot } from 'lucide-react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NavLink } from '~/common';
import Nav from '../Nav';

let mockActive = 'conversations';
jest.mock('~/Providers', () => ({
  useActivePanel: () => ({ active: mockActive }),
  resolveActivePanel: (active: string) => active,
}));
const mounted = jest.fn();
function Workspace() {
  const [value, setValue] = useState(() => {
    mounted();
    return '';
  });
  return (
    <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />
  );
}
const links: NavLink[] = [
  {
    id: 'conversations',
    title: 'com_ui_chat_history',
    label: '',
    icon: Bot,
    Component: () => <p>History</p>,
  },
  {
    id: 'personal-space',
    title: 'com_codechat_projects_tab',
    label: '',
    icon: Bot,
    Component: Workspace,
  },
];

it('loads project controls only when opened and preserves drafts across sidebar navigation', () => {
  const view = render(<Nav links={links} />);
  expect(mounted).not.toHaveBeenCalled();
  mockActive = 'personal-space';
  view.rerender(<Nav links={links} />);
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Unsaved draft' } });
  mockActive = 'conversations';
  view.rerender(<Nav links={links} />);
  expect(screen.getByLabelText('Draft')).not.toBeVisible();
  mockActive = 'personal-space';
  view.rerender(<Nav links={links} />);
  expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved draft');
  expect(screen.getByLabelText('Draft')).toBeVisible();
  expect(mounted).toHaveBeenCalledTimes(1);
});
