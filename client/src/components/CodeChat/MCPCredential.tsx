import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, saveProgrammingMCPCredential } from 'librechat-data-provider';
import type { ProgrammingMCP } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

export default function MCPCredential({ server }: { server: ProgrammingMCP }) {
  const t = useLocalize();
  const { token, user } = useAuthContext();
  const client = useQueryClient();
  const valueAtom = useMemo(() => atom(''), []);
  const [value, setValue] = useAtom(valueAtom);
  const mutation = useMutation({
    mutationFn: (secret: string | null) =>
      saveProgrammingMCPCredential(token!, server.id, {
        secret,
        revision: server.credential_revision ?? 0,
      }),
    onSettled: async () => {
      setValue('');
      await client.invalidateQueries([QueryKeys.programmingMCP, user?.id]);
    },
    retry: false,
  });
  return (
    <div className="bg-surface-secondary space-y-2 rounded-lg p-3">
      <p className="text-xs">
        {t(
          server.credential_configured
            ? 'com_codechat_mcp_connected'
            : 'com_codechat_mcp_personal_required',
        )}
      </p>
      <label className="block space-y-1 text-xs">
        {t('com_codechat_mcp_token')}
        <input
          type="password"
          autoComplete="new-password"
          maxLength={4096}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="border-border-light bg-surface-primary text-text-primary w-full rounded-md border px-2 py-1"
        />
      </label>
      <p className="text-text-secondary text-xs">{t('com_codechat_mcp_secret_notice')}</p>
      <div className="flex gap-2">
        <Button
          size="xs"
          disabled={!server.enabled || !value || mutation.isLoading}
          onClick={() => mutation.mutate(value)}
        >
          {t('com_codechat_mcp_save_credential')}
        </Button>
        {server.credential_stored && (
          <Button
            size="xs"
            variant="outline"
            disabled={mutation.isLoading}
            onClick={() => mutation.mutate(null)}
          >
            {t('com_codechat_mcp_revoke_credential')}
          </Button>
        )}
      </div>
      {mutation.isError && (
        <p role="alert" className="text-xs">
          {t('com_codechat_programming_error')}
        </p>
      )}
      {mutation.isSuccess && (
        <p role="status" className="text-xs">
          {t('com_codechat_mcp_credential_saved')}
        </p>
      )}
    </div>
  );
}
