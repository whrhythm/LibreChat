import type { CapacityAccount, CapacityPlan } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

export default function QuotaSummary({
  plan,
  usage,
}: {
  plan: Partial<CapacityPlan>;
  usage?: CapacityAccount['quota_usage'];
}) {
  const t = useLocalize();
  const cpu = (value?: number) => (value == null ? '—' : value / 1000);
  const rows = [
    t('com_codechat_quota_app_total', {
      cpu: cpu(plan.applications_cpu_millicores),
      memory: plan.applications_memory_mib ?? '—',
    }),
    t('com_codechat_quota_database', {
      total: plan.database_budget_mib ?? '—',
      single: plan.database_per_instance_mib ?? '—',
      maximum: plan.database_limit ?? '—',
    }),
    t('com_codechat_quota_agent', {
      cpu: cpu(plan.agent_cpu_millicores),
      memory: plan.agent_memory_mib ?? '—',
      maximum: plan.agent_concurrency ?? '—',
    }),
    t('com_codechat_quota_agent_time', {
      command: plan.agent_command_seconds ?? '—',
      task: plan.agent_task_seconds ?? '—',
    }),
    t('com_codechat_quota_build', {
      cpu: cpu(plan.build_cpu_millicores),
      memory: plan.build_memory_mib ?? '—',
      seconds: plan.build_timeout_seconds ?? '—',
      maximum: plan.build_concurrency ?? '—',
    }),
  ];
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-2">
        {rows.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      {usage && (
        <p className="border-border-light bg-surface-secondary rounded-lg border p-3">
          {t('com_codechat_quota_allocated', {
            cpu: cpu(usage.application_cpu_millicores),
            memory: usage.application_memory_mib,
            databases: usage.database_count,
            agents: usage.agent_active,
            builds: usage.build_active,
          })}
        </p>
      )}
      <p className="text-text-secondary text-xs leading-relaxed">
        {t('com_codechat_quota_boundaries')}
      </p>
    </div>
  );
}
