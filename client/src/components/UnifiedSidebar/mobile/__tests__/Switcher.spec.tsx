import React from 'react';
import { Provider, createStore } from 'jotai';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NavLink } from '~/common';
import { ActivePanelProvider } from '~/Providers/ActivePanelContext';
import Switcher from '../Switcher';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/utils', () => ({ cn: (...classes: string[]) => classes.join(' ') }));
jest.mock('@librechat/client', () => ({
  buttonVariants: () => '',
  DropdownPopup: ({ items }: { items: { id: string; label: string; onClick: () => void }[] }) => (
    <div>
      {items.map((item) => (
        <button key={item.id} onClick={item.onClick}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

it('keeps a custom resource panel open but closes the drawer after a route action', () => {
  const openSpace = jest.fn();
  const openRoute = jest.fn();
  const closeDrawer = jest.fn();
  const links: NavLink[] = [
    {
      id: 'personal-space',
      title: 'com_codechat_workspace',
      icon: () => null,
      Component: () => null,
      onClick: openSpace,
    },
    { id: 'insights', title: 'com_insights_navigation', icon: () => null, onClick: openRoute },
  ];
  render(
    <Provider store={createStore()}>
      <ActivePanelProvider>
        <Switcher links={links} onNavigate={closeDrawer} />
      </ActivePanelProvider>
    </Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_codechat_workspace' }));
  expect(openSpace).toHaveBeenCalledTimes(1);
  expect(closeDrawer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'com_insights_navigation' }));
  expect(openRoute).toHaveBeenCalledTimes(1);
  expect(closeDrawer).toHaveBeenCalledTimes(1);
});
