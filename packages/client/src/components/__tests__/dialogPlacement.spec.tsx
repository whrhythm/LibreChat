import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogDescription } from '../OriginalDialog';
import { Textarea } from '../Textarea';

describe('dialog placement and code field', () => {
  it('preserves centered dialogs by default', () => {
    render(
      <OGDialog open>
        <OGDialogContent>
          <OGDialogTitle>Preview</OGDialogTitle>
          <OGDialogDescription>File preview</OGDialogDescription>
        </OGDialogContent>
      </OGDialog>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('left-[50%]', 'top-[50%]');
  });

  it('supports a right editor using shared theme roles and reduced motion, with normal dialog close behavior', () => {
    const change = jest.fn();
    document.documentElement.style.setProperty('--theme-dialog-stroke', '2px');
    render(
      <OGDialog open onOpenChange={change}>
        <OGDialogContent placement="right">
          <OGDialogTitle>Editor</OGDialogTitle>
          <OGDialogDescription>Code editing</OGDialogDescription>
          <Textarea variant="code" aria-label="Code" defaultValue="hello" />
        </OGDialogContent>
      </OGDialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('right-0', 'top-0', 'bg-surface-dialog', 'border-border-light');
    expect(dialog.className).toContain('motion-reduce:animate-none');
    expect(screen.getByRole('textbox', { name: 'Code' })).toHaveClass('font-mono');
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(change).toHaveBeenCalledWith(false);
    document.documentElement.style.removeProperty('--theme-dialog-stroke');
  });
});
