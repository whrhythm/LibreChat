import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import { personalFileRequest, QueryKeys } from 'librechat-data-provider';
import type { WorkspaceEntry } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

// An editable HTML file must never run with the chat application's origin or credentials.
const offlinePolicy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">`;

export default function ProjectWeb({ path, deployed }: { path: string; deployed: string | null }) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const reloadAtom = useMemo(() => atom(0), []);
  const [reload, setReload] = useAtom(reloadAtom);
  const preview = useQuery({
    queryKey: [QueryKeys.codechatFiles, user?.id, path, 'web-preview'],
    queryFn: async () => {
      const listing = await personalFileRequest(token!, 'directories', 'GET', path);
      const { entries } = (await listing.json()) as { entries: WorkspaceEntry[] };
      const entry = entries.find((file) => file.name === 'index.html' && file.kind === 'file');
      if (!entry) return null;
      if ((entry.size ?? 0) > 1024 * 1024) throw new Error('preview_too_large');
      const response = await personalFileRequest(token!, 'file', 'GET', path + '/index.html');
      const blob = await response.blob();
      if (blob.size > 1024 * 1024) throw new Error('preview_too_large');
      return offlinePolicy + (await blob.text());
    },
    enabled: !!token,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const address = deployed?.startsWith('https://') ? deployed : null;
  const live = preview.isSuccess && preview.data === null && address;
  return (
    <div className="flex min-h-72 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {preview.data && <span>{t('com_project_web_draft')}</span>}
        {live && <span>{t('com_project_web_live')}</span>}
        <Button
          size="xs"
          variant="outline"
          disabled={preview.isFetching}
          onClick={() => {
            void preview.refetch().then((result) => {
              if (result.isSuccess) setReload((old) => old + 1);
            });
          }}
        >
          {t('com_ui_refresh')}
        </Button>
        {deployed && (
          <Button asChild size="xs" variant="ghost">
            <a href={deployed} target="_blank" rel="noopener noreferrer">
              {t('com_project_visit_app')}
            </a>
          </Button>
        )}
      </div>
      {preview.isLoading && <p role="status">{t('com_ui_loading')}</p>}
      {preview.isError && <p role="alert">{t('com_project_web_error')}</p>}
      {preview.isSuccess && !preview.data && !live && <p>{t('com_project_web_empty')}</p>}
      {preview.data && (
        <iframe
          key={reload}
          title={t('com_project_web_draft')}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={preview.data}
          className="border-border-light min-h-72 w-full flex-1 rounded border"
        />
      )}
      {live && (
        <iframe
          key={reload}
          title={t('com_project_web_live')}
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
          src={live}
          className="border-border-light min-h-72 w-full flex-1 rounded border"
        />
      )}
    </div>
  );
}
