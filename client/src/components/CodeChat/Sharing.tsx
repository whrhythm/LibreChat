import { useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Button } from '@librechat/client';
import { MoreHorizontal, UserRoundPlus } from 'lucide-react';
import type { AIReleaseList } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type Member = AIReleaseList['members'][number];
type Change = (input: { suffix: string; body: object }) => void;
const inputClass =
  'w-full rounded border border-border-light bg-surface-primary px-2 py-1.5 text-sm text-text-primary';

function MemberRow({ member, busy, change }: { member: Member; busy: boolean; change: Change }) {
  const t = useLocalize();
  const state = useMemo(() => atom<{ budget: string; expires: string } | null>(null), []);
  const [edit, setEdit] = useAtom(state);
  const moreState = useMemo(() => atom(false), []);
  const [more, setMore] = useAtom(moreState);
  const labels = {
    pending: 'com_sharing_pending',
    active: 'com_sharing_active',
    revoked: 'com_sharing_revoked',
    declined: 'com_sharing_declined',
    expired: 'com_sharing_expired',
  } as const;
  const active = member.state === 'active' || member.state === 'pending';
  return (
    <article className="space-y-2 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={member.label}>
          {member.label}
        </span>
        <span className="bg-surface-secondary text-text-secondary shrink-0 rounded-full px-2 py-0.5">
          {t(labels[member.state])}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label={t('com_sharing_member_options', { 0: member.label })}
          aria-expanded={more}
          onClick={() => {
            setMore(!more);
            setEdit(null);
          }}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </div>
      {more && (
        <div className="bg-surface-secondary text-text-secondary space-y-2 rounded-md p-2">
          <p>
            {t('com_sharing_spent')} ${(member.spent_micros / 1e6).toFixed(6)} ·{' '}
            {t('com_sharing_pending_cost')} ${(member.pending_micros / 1e6).toFixed(6)}
          </p>
          <p>
            {t('com_sharing_limit')}{' '}
            {member.budget_micros == null
              ? t('com_sharing_inherit')
              : '$' +
                (member.budget_micros / 1e6).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6,
                })}
          </p>
          <p>
            {t('com_sharing_expiry')}{' '}
            {member.expires_at
              ? new Date(member.expires_at).toLocaleString()
              : t('com_sharing_no_expiry')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() =>
                setEdit({
                  budget: member.budget_micros == null ? '' : String(member.budget_micros / 1e6),
                  expires: member.expires_at
                    ? new Date(
                        new Date(member.expires_at).getTime() -
                          new Date(member.expires_at).getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : '',
                })
              }
            >
              {t('com_sharing_adjust')}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (active && !window.confirm(t('com_sharing_revoke_confirm'))) return;
                change({
                  suffix: '/members',
                  body: {
                    identifier: member.native_id,
                    enabled: !active,
                    expected_revision: member.revision,
                  },
                });
              }}
            >
              {t(active ? 'com_releases_revoke' : 'com_sharing_reinvite')}
            </Button>
          </div>
        </div>
      )}
      {edit && (
        <form
          className="border-border-light space-y-2 border-t pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            change({
              suffix: '/policy',
              body: {
                native_id: member.native_id,
                expected_revision: member.revision,
                budget_micros: edit.budget === '' ? null : Math.round(Number(edit.budget) * 1e6),
                expires_at: edit.expires ? new Date(edit.expires).toISOString() : null,
              },
            });
          }}
        >
          <label className="block space-y-1">
            {t('com_sharing_limit')}
            <input
              className={inputClass}
              type="number"
              min="0"
              max="100"
              step="0.001"
              placeholder={t('com_sharing_inherit')}
              value={edit.budget}
              disabled={busy}
              onChange={(e) => setEdit({ ...edit, budget: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            {t('com_sharing_expiry')}
            <input
              className={inputClass}
              type="datetime-local"
              value={edit.expires}
              disabled={busy}
              onChange={(e) => setEdit({ ...edit, expires: e.target.value })}
            />
          </label>
          <div className="flex gap-2">
            <Button size="xs" type="submit" disabled={busy}>
              {t('com_ui_save')}
            </Button>
            <Button
              size="xs"
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setEdit(null)}
            >
              {t('com_ui_cancel')}
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}

export default function Sharing({
  members,
  busy,
  change,
  defaultBudgetMicros = 100000,
}: {
  members: Member[];
  busy: boolean;
  change: Change;
  defaultBudgetMicros?: number;
}) {
  const t = useLocalize();
  const state = useMemo(
    () => atom({ email: '', budget: String(defaultBudgetMicros / 1e6), expires: '', open: false }),
    [defaultBudgetMicros],
  );
  const [form, setForm] = useAtom(state);
  return (
    <section className="space-y-2" aria-label={t('com_releases_members')}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">
          {t('com_releases_members')} · {members.length}
        </h4>
        <Button
          size="xs"
          type="button"
          variant="outline"
          aria-expanded={form.open}
          disabled={busy}
          onClick={() => setForm({ ...form, open: !form.open })}
        >
          <UserRoundPlus className="mr-1 size-3.5" aria-hidden="true" />
          {t('com_sharing_invite_short')}
        </Button>
      </div>
      {form.open && (
        <form
          className="border-border-light space-y-2 rounded-md border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            change({
              suffix: '/members',
              body: {
                identifier: form.email,
                enabled: true,
                budget_micros: Math.round(Number(form.budget) * 1e6),
                expires_at: form.expires ? new Date(form.expires).toISOString() : null,
              },
            });
          }}
        >
          <label className="block space-y-1">
            {t('com_releases_email')}
            <input
              className={inputClass}
              type="text"
              required
              value={form.email}
              disabled={busy}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              {t('com_sharing_limit')}
              <input
                className={inputClass}
                type="number"
                required
                min="0"
                max="100"
                step="0.001"
                value={form.budget}
                disabled={busy}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              {t('com_sharing_expiry')}
              <input
                className={inputClass}
                type="datetime-local"
                value={form.expires}
                disabled={busy}
                onChange={(e) => setForm({ ...form, expires: e.target.value })}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="xs" type="submit" disabled={busy}>
              {t('com_releases_invite')}
            </Button>
            <Button
              size="xs"
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setForm({ ...form, open: false })}
            >
              {t('com_ui_cancel')}
            </Button>
          </div>
        </form>
      )}
      {!members.length && <p className="text-text-secondary py-4">{t('com_sharing_empty')}</p>}
      <div className="divide-border-light divide-y">
        {members.map((member) => (
          <MemberRow
            key={member.native_id + ':' + member.revision}
            member={member}
            busy={busy}
            change={change}
          />
        ))}
      </div>
    </section>
  );
}
