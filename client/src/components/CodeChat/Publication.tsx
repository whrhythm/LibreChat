import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import type { RefObject } from 'react';
import { useLocalize } from '~/hooks';

export default function Publication({
  triggerRef,
  path,
  open,
  pending,
  blocked,
  error,
  onClose,
  onConfirm,
}: {
  triggerRef: RefObject<HTMLButtonElement>;
  path: string;
  open: boolean;
  pending: boolean;
  blocked: boolean;
  error: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useLocalize();
  return (
    <OGDialog
      triggerRef={triggerRef}
      open={open}
      onOpenChange={(value) => {
        if (!value && !pending) onClose();
      }}
    >
      <OGDialogContent className="sm:max-w-lg">
        <OGDialogTitle>{t('com_codechat_publication_title')}</OGDialogTitle>
        <OGDialogDescription>{t('com_codechat_delivery_project', { path })}</OGDialogDescription>
        <div className="space-y-3 text-sm">
          <p>{t('com_codechat_publication_source')}</p>
          <p>{t('com_codechat_publication_impact')}</p>
          <p>{t('com_codechat_publication_cost')}</p>
          <p className="text-text-secondary">{t('com_codechat_delivery_access')}</p>
          {blocked && <p role="alert">{t('com_codechat_publication_blocked')}</p>}
          {error && <p role="alert">{t('com_codechat_app_error')}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {t('com_ui_cancel')}
          </Button>
          <Button disabled={pending || blocked || error} onClick={onConfirm}>
            {t(
              pending ? 'com_codechat_publication_submitting' : 'com_codechat_publication_confirm',
            )}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
