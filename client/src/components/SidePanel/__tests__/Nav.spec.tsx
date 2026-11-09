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

it.each(['personal-space', 'knowledge-libraries'])(
  'keeps unsaved %s edits across sidebar navigation',
  (panel) => {
    mockActive = 'conversations';
    mounted.mockClear();
    const panelLinks = links.map((link) =>
      link.id === 'personal-space' ? { ...link, id: panel } : link,
    );
    const view = render(<Nav links={panelLinks} />);
    expect(mounted).not.toHaveBeenCalled();
    mockActive = panel;
    view.rerender(<Nav links={panelLinks} />);
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Unsaved draft' } });
    mockActive = 'conversations';
    view.rerender(<Nav links={panelLinks} />);
    expect(screen.getByLabelText('Draft')).not.toBeVisible();
    mockActive = panel;
    view.rerender(<Nav links={panelLinks} />);
    expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved draft');
    expect(screen.getByLabelText('Draft')).toBeVisible();
    expect(mounted).toHaveBeenCalledTimes(1);
  },
);
