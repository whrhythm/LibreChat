import type { ReleaseProvenance } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

const resultLabels = {
  passed: 'com_codechat_acceptance_passed',
  changes_requested: 'com_codechat_acceptance_changes',
  pending: 'com_codechat_acceptance_pending',
} as const;

export function acceptanceLabel(record?: ReleaseProvenance | null) {
  if (!record) return 'com_codechat_provenance_legacy';
  if (record.acceptance_state === 'matched') return 'com_codechat_provenance_matched';
  if (record.acceptance_state === 'changed') return 'com_codechat_provenance_changed';
  if (record.acceptance_state === 'pending') return 'com_codechat_provenance_pending';
  return 'com_codechat_provenance_unbound';
}

export default function Provenance({
  record,
  attempt = false,
}: {
  record?: ReleaseProvenance | null;
  attempt?: boolean;
}) {
  const t = useLocalize();
  const counts = record?.acceptance?.counts;
  return (
    <section className="border-border-light space-y-2 rounded-lg border p-3">
      <p className="font-medium">
        {t(attempt ? 'com_codechat_provenance_attempt' : 'com_codechat_provenance_release')}
      </p>
      {record && (
        <>
          <p>{t('com_codechat_provenance_version', { version: record.revision.slice(0, 8) })}</p>
          {record.source_sha256 && (
            <p className="font-mono text-xs break-all" title={record.source_sha256}>
              {t('com_codechat_provenance_source', { hash: record.source_sha256.slice(0, 12) })}
            </p>
          )}
          {record.image_digest && (
            <p className="font-mono text-xs break-all" title={record.image_digest}>
              {t('com_codechat_provenance_image', { hash: record.image_digest.slice(7, 19) })}
            </p>
          )}
          {record.confirmed_at && (
            <p className="text-text-secondary text-xs">
              {t('com_codechat_provenance_time', {
                time: new Date(record.confirmed_at).toLocaleString(),
              })}
            </p>
          )}
        </>
      )}
      <p>{t(acceptanceLabel(record))}</p>
      {record?.acceptance_state === 'matched' && counts && (
        <>
          <p>
            {t('com_codechat_acceptance_summary', {
              passed: counts.passed,
              total: counts.total,
              changes: counts.changes_requested,
            })}
          </p>
          <ul className="space-y-1">
            {record.acceptance?.criteria?.map((item) => (
              <li key={item.id} className="break-words">
                {item.text} · {t(resultLabels[item.result])}
              </li>
            ))}
          </ul>
          <p className="text-text-secondary text-xs">
            {t('com_codechat_provenance_revision', { revision: record.acceptance?.revision })}
          </p>
        </>
      )}
      {record?.acceptance && /^[0-9a-f-]{36}$/.test(record.acceptance.conversation_id) && (
        <a
          className="underline"
          href={'/c/' + encodeURIComponent(record.acceptance.conversation_id)}
        >
          {t('com_codechat_provenance_task')}
        </a>
      )}
    </section>
  );
}
