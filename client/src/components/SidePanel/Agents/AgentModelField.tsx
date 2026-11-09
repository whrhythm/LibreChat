import { Label } from '@librechat/client';
import { useWatch } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { ResolvedProviderIcon } from '~/components/Endpoints/ResolvedProviderIcon';
import { useGetAgentsConfig, useLocalize } from '~/hooks';
import { useProviderIcon } from '~/hooks/Endpoint';
import { cn } from '~/utils';

export default function AgentModelField({
  id = 'provider',
  onSelect,
}: {
  id?: string;
  onSelect: () => void;
}) {
  const localize = useLocalize();
  const { endpointsConfig } = useGetAgentsConfig();
  const provider = useWatch<AgentForm, 'provider'>({ name: 'provider' });
  const model = useWatch<AgentForm, 'model'>({ name: 'model' });
  const providerValue = typeof provider === 'string' ? provider : provider?.value;
  const { provider: providerId, imageURL } = useProviderIcon({
    endpoint: providerValue as string,
    endpointsConfig,
  });
  return (
    <div className="flex min-w-0 flex-col">
      <Label
        variant="secondary"
        className="text-2xs mb-1 block font-medium tracking-wide uppercase"
        htmlFor={id}
      >
        {localize('com_ui_model')} <span className="text-text-destructive">*</span>
      </Label>
      <button
        id={id}
        type="button"
        onClick={onSelect}
        title={model || undefined}
        className={cn(
          'border-border-control bg-surface-secondary text-text-primary hover:bg-surface-tertiary focus-visible:ring-ring-primary relative flex h-9 w-full min-w-0 items-center overflow-hidden rounded-lg border text-sm font-medium transition-colors focus:outline-hidden focus-visible:ring-2',
          model != null && model ? 'px-1' : 'px-3',
        )}
      >
        <div className="flex w-full min-w-0 items-center gap-2">
          {providerValue !== undefined && (
            <div className="avatar-stroke bg-surface-primary text-text-primary relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
              <ResolvedProviderIcon
                provider={providerId}
                imageURL={imageURL}
                size={16}
                className="h-2/3 w-2/3"
              />
            </div>
          )}
          <span className="truncate">
            {model != null && model ? model : localize('com_ui_select_model')}
          </span>
        </div>
      </button>
    </div>
  );
}
