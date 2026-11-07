import { useMemo, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { FolderPlus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { personalFileRequest, QueryKeys } from 'librechat-data-provider';
import {
  Button,
  Input,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import { useAuthContext, useLocalize } from '~/hooks';

export default function NewFolder({
  path,
  onCreated,
}: {
  path: string;
  onCreated?: (path: string) => void;
}) {
  const t = useLocalize();
  const { token, user } = useAuthContext();
  const query = useQueryClient();
  const trigger = useRef<HTMLButtonElement>(null);
  const state = useMemo(() => atom({ open: false, name: '' }), []);
  const [value, setValue] = useAtom(state);
  const create = useMutation({
    mutationFn: async () => {
      if (!value.name.trim() || /[/\\]/.test(value.name) || ['.', '..'].includes(value.name))
        throw new Error('name');
      const target = (path ? path + '/' : '') + value.name.trim();
      await personalFileRequest(token!, 'directories', 'POST', target);
      return target;
    },
    onSuccess: async (target) => {
      await query.invalidateQueries([QueryKeys.codechatFiles, user?.id]);
      setValue({ open: false, name: '' });
      onCreated?.(target);
    },
    retry: false,
  });
  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => {
          create.reset();
          setValue({ open: true, name: '' });
        }}
      >
        <FolderPlus className="size-3.5" aria-hidden="true" />
        {t('com_codechat_folder_create')}
      </Button>
      <OGDialog
        open={value.open}
        onOpenChange={(open) => setValue((old) => ({ ...old, open }))}
        triggerRef={trigger}
      >
        <OGDialogContent className="sm:max-w-md">
          <OGDialogTitle>{t('com_codechat_folder_create')}</OGDialogTitle>
          <OGDialogDescription>
            {t('com_codechat_folder_parent', { path: path || '/' })}
          </OGDialogDescription>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <Input
              aria-label={t('com_codechat_folder_name')}
              value={value.name}
              maxLength={255}
              onChange={(event) => setValue((old) => ({ ...old, name: event.target.value }))}
            />
            {create.isError && (
              <p role="alert" className="text-sm">
                {t('com_codechat_folder_error')}
              </p>
            )}
            <Button type="submit" disabled={create.isLoading || !value.name.trim()}>
              {t('com_codechat_folder_create')}
            </Button>
          </form>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
