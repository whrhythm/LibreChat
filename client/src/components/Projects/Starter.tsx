import { ArrowDown } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import { Button } from '@librechat/client';
import type { ProjectTemplate } from 'librechat-data-provider';
import { useChatFormContext } from '~/Providers/ChatFormContext';
import { templateLabels, templatePrompts } from './templates';
import { useLocalize } from '~/hooks';

export default function ProjectStarter({
  template,
  focusInput,
}: {
  template: Exclude<ProjectTemplate, 'blank'>;
  focusInput: () => void;
}) {
  const t = useLocalize();
  const { control, getValues, setValue } = useChatFormContext();
  const draft = useWatch({ control, name: 'text' });
  if (!Object.hasOwn(templatePrompts, template)) return null;
  const prompt = t(templatePrompts[template]);

  return (
    <div className="mx-auto mb-3 flex max-w-3xl flex-col items-start gap-1 px-4">
      <span className="text-text-secondary text-xs">{t(templateLabels[template])}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-auto max-w-full justify-start text-start whitespace-normal"
        disabled={Boolean(draft?.trim())}
        onClick={() => {
          if (getValues('text')?.trim()) return;
          setValue('text', prompt, { shouldDirty: true, shouldValidate: true });
          focusInput();
        }}
      >
        <ArrowDown className="size-3.5 shrink-0" aria-hidden="true" />
        {prompt}
      </Button>
    </div>
  );
}
