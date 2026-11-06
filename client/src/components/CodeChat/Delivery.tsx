import { useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { ClipboardList, Copy, ExternalLink } from 'lucide-react';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import type { PersonalApplication } from 'librechat-data-provider';
import { deliveryAddress, deliveryState } from './delivery';
import { useLocalize } from '~/hooks';

/** A handoff describes observed delivery facts, never invents business test results. */
export default function Delivery({ app, stale }: { app: PersonalApplication; stale: boolean }) {
  const t = useLocalize();
  const trigger = useRef<HTMLButtonElement>(null);
  const state = useMemo(() => atom({ open: false, copy: '' }), []);
  const [value, setValue] = useAtom(state);
  const address = deliveryAddress(app);
  const summary = [
    t('com_codechat_delivery_title'),
    t('com_codechat_delivery_project', { path: app.project_path }),
    t(deliveryState(app)),
    ...(stale ? [t('com_codechat_delivery_stale')] : []),
    ...(address ? [t('com_codechat_delivery_address', { url: address })] : []),
    t('com_codechat_delivery_business'),
    t('com_codechat_delivery_access'),
    t('com_codechat_delivery_checklist'),
  ].join('\n\n');
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="xs"
        onClick={() => setValue({ open: true, copy: '' })}
      >
        <ClipboardList className="size-3.5" aria-hidden="true" />
        {t('com_codechat_delivery_title')}
      </Button>
      <OGDialog
        open={value.open}
        triggerRef={trigger}
        onOpenChange={(open) => setValue({ open, copy: '' })}
      >
        <OGDialogContent className="sm:max-w-lg">
          <OGDialogTitle>{t('com_codechat_delivery_title')}</OGDialogTitle>
          <OGDialogDescription>
            {t('com_codechat_delivery_project', { path: app.project_path })}
          </OGDialogDescription>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto text-sm">
            <p role="status" className="font-medium">
              {t(deliveryState(app))}
            </p>
            {stale && <p role="alert">{t('com_codechat_delivery_stale')}</p>}
            {address && (
              <a
                href={address}
                target="_blank"
                rel="noreferrer"
                className="text-text-primary flex items-start gap-2 break-all underline"
              >
                <ExternalLink className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {address}
              </a>
            )}
            <div className="bg-surface-secondary space-y-2 rounded-lg p-3">
              <p className="font-medium">{t('com_codechat_delivery_business')}</p>
              <p className="text-text-secondary whitespace-pre-line">
                {t('com_codechat_delivery_checklist')}
              </p>
            </div>
            <p className="text-text-secondary">{t('com_codechat_delivery_access')}</p>
            <details>
              <summary className="cursor-pointer">
                {t('com_codechat_delivery_copy_preview')}
              </summary>
              <pre className="mt-2 font-sans text-xs break-words whitespace-pre-wrap select-text">
                {summary}
              </pre>
            </details>
            {value.copy && (
              <p role="status">
                {t(
                  value.copy === 'ok'
                    ? 'com_codechat_delivery_copied'
                    : 'com_codechat_delivery_copy_failed',
                )}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setValue({ open: false, copy: '' })}>
              {t('com_ui_close')}
            </Button>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(summary);
                  setValue((old) => ({ ...old, copy: 'ok' }));
                } catch {
                  setValue((old) => ({ ...old, copy: 'failed' }));
                }
              }}
            >
              <Copy className="size-4" aria-hidden="true" />
              {t('com_codechat_delivery_copy')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
