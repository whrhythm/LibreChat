import { useEffect, useId, useMemo } from 'react';
import { atom, useAtom } from 'jotai';
import { Button, Input } from '@librechat/client';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AITrialError, projectTrials, QueryKeys, trialConfigSchema } from 'librechat-data-provider';
import type { AITrials, TrialConfig } from 'librechat-data-provider';
import type { DefaultValues } from 'react-hook-form';
import type { AgentItem } from '~/components/SidePanel/Agents/Tools/items/types';
import type { AgentForm } from '~/common';
import MarketplaceCatalog from '~/components/SidePanel/Agents/Tools/MarketplaceCatalog';
import { SelectedSection } from '~/components/SidePanel/Agents/Tools/ToolsSection';
import AgentModelField from '~/components/SidePanel/Agents/AgentModelField';
import Instructions from '~/components/SidePanel/Agents/Instructions';
import ModelPanel from '~/components/SidePanel/Agents/ModelPanel';
import { useAuthContext, useLocalize } from '~/hooks';
import { Panel } from '~/common';

const parameterKeys = ['temperature', 'max_output_tokens'] as const;

function defaults(config: TrialConfig): DefaultValues<AgentForm> {
  return {
    provider: 'LiteLLM',
    model: config.model,
    instructions: config.instructions,
    instructionsSource: 'inline',
    model_parameters: {
      temperature: config.temperature,
      max_output_tokens: config.max_output_tokens,
    },
    tools: [
      ...(config.tool_reference ? [config.tool_reference] : []),
      ...(config.calculator_enabled ? ['calculator'] : []),
    ],
  };
}

export default function Draft({ projectId, draft }: { projectId: string; draft: AITrials }) {
  const { user, token } = useAuthContext();
  const t = useLocalize();
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: (body: { config: TrialConfig; expected_digest: string } | undefined) =>
      projectTrials(token!, projectId, body ? '/update' : '/initialize', body ?? {}),
    onSuccess: (result) => {
      cache.setQueryData([QueryKeys.aiProjects, user?.id, projectId, 'trials'], result);
      void cache.invalidateQueries([QueryKeys.aiProjects, user?.id, projectId, 'trials']);
    },
    onError: () =>
      void cache.invalidateQueries([QueryKeys.aiProjects, user?.id, projectId, 'trials']),
  });
  const error = save.error instanceof AITrialError ? save.error.code : undefined;
  return (
    <div className="space-y-2">
      {draft.config ? (
        <Editor draft={draft} pending={save.isLoading} onSave={(body) => save.mutateAsync(body)} />
      ) : (
        <Button size="sm" onClick={() => save.mutate(undefined)} disabled={save.isLoading}>
          {t('com_trials_initialize')}
        </Button>
      )}
      {save.isError && (
        <p role="alert" className="text-sm">
          {t(error === 'ai_trials_draft_changed' ? 'com_trials_changed' : 'com_trials_error')}
        </p>
      )}
    </div>
  );
}

function Editor({
  draft,
  pending,
  onSave,
}: {
  draft: AITrials;
  pending: boolean;
  onSave: (body: { config: TrialConfig; expected_digest: string }) => Promise<AITrials>;
}) {
  const t = useLocalize();
  const modelId = useId();
  const [savedBase, setBase] = useAtom(useMemo(() => atom<AITrials | null>(null), []));
  const base = savedBase ?? draft;
  const [view, setView] = useAtom(useMemo(() => atom<'config' | 'model' | 'tools'>('config'), []));
  const [search, setSearch] = useAtom(useMemo(() => atom(''), []));
  const methods = useForm<AgentForm>({ defaultValues: defaults(base.config!) });
  const { control, reset, setValue, handleSubmit } = methods;
  const [instructions, model, parameters, toolReferences] = useWatch({
    control,
    name: ['instructions', 'model', 'model_parameters', 'tools'],
  });
  const original = base.config!;
  const calculator = toolReferences?.includes('calculator') ?? false;
  const config = {
    ...original,
    instructions: instructions ?? '',
    model: model ?? '',
    temperature: parameters?.temperature ?? original.temperature,
    max_output_tokens: parameters?.max_output_tokens ?? original.max_output_tokens,
    tool_reference: toolReferences?.find((id) => id !== 'calculator') ?? null,
    ...(calculator || original.calculator_enabled != null
      ? { calculator_enabled: calculator }
      : {}),
  };
  const dirty =
    config.instructions !== original.instructions ||
    config.model !== original.model ||
    config.temperature !== original.temperature ||
    config.max_output_tokens !== original.max_output_tokens ||
    config.tool_reference !== (original.tool_reference ?? null) ||
    calculator !== Boolean(original.calculator_enabled);
  const stale = draft.digest !== base.digest;
  useEffect(() => {
    if (!savedBase) setBase(draft);
    if (!dirty && stale && draft.config) {
      reset(defaults(draft.config));
      setBase(draft);
    }
  }, [dirty, stale, draft, reset, savedBase, setBase]);

  const tools = draft.available_tools ?? [];
  const current = tools.find((tool) => tool.reference === config.tool_reference);
  const makeItem = (id: string, name: string, description: string): AgentItem => ({
    id,
    name,
    description,
    iconKey: 'mcp',
    kind: 'tool',
    plugin: { pluginKey: id, name },
  });
  const catalog = tools.map((tool) =>
    makeItem(tool.reference, tool.service + ' / ' + tool.name, tool.description),
  );
  const canUseCalculator = draft.available_builtin_tools?.includes('calculator');
  const calculatorItem = makeItem('calculator', t('com_project_calculator'), '');
  if (canUseCalculator) catalog.push(calculatorItem);
  const selected = catalog.filter(
    (tool) => tool.id === config.tool_reference || (tool.id === 'calculator' && calculator),
  );
  if (calculator && !canUseCalculator) selected.push({ ...calculatorItem, status: 'needs_setup' });
  if (config.tool_reference && !current) {
    selected.push({
      ...makeItem(
        config.tool_reference,
        config.tool_reference.split(':')[config.tool_reference.startsWith('mcp:') ? 2 : 1],
        '',
      ),
      status: 'needs_setup',
    });
  }
  const parsed = trialConfigSchema.safeParse(config);
  const valid =
    parsed.success &&
    parsed.data.max_output_tokens <= draft.output_limit &&
    draft.models.includes(parsed.data.model) &&
    (!config.tool_reference || !!current) &&
    (!calculator || !!canUseCalculator);
  const openTools = () => {
    setSearch('');
    setView('tools');
  };
  const selectTool = (item: AgentItem) => {
    const next = item.id === config.tool_reference ? null : item.id;
    const reference = item.id === 'calculator' ? config.tool_reference : next;
    const enableCalculator = item.id === 'calculator' ? !calculator : calculator;
    setValue('tools', [
      ...(reference ? [reference] : []),
      ...(enableCalculator ? ['calculator'] : []),
    ]);
  };
  const save = handleSubmit(async () => {
    if (!parsed.success || !valid || !base.digest || stale || !dirty || pending) return;
    try {
      const updated = await onSave({ config: parsed.data, expected_digest: base.digest });
      if (!updated.config) return;
      reset(defaults(updated.config));
      setBase(updated);
    } catch {
      // Mutation errors are rendered by the parent.
    }
  });
  return (
    <FormProvider {...methods}>
      <form className="space-y-2" onSubmit={save}>
        <fieldset disabled={pending} className="min-w-0">
          {view === 'model' && (
            <ModelPanel
              models={{ LiteLLM: draft.models }}
              providers={[{ label: 'LiteLLM', value: 'LiteLLM' }]}
              modelsReady
              modelsError={false}
              parameterKeys={parameterKeys}
              setActivePanel={(panel) => {
                if (panel === Panel.builder) setView('config');
              }}
            />
          )}
          {view === 'tools' && (
            <section className="space-y-2" aria-label={t('com_ui_tools_marketplace')}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('com_ui_tools_marketplace')}</h3>
                <Button type="button" size="xs" variant="ghost" onClick={() => setView('config')}>
                  {t('com_ui_back_to_builder')}
                </Button>
              </div>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={t('com_ui_tools_marketplace_search')}
                placeholder={t('com_ui_tools_marketplace_search')}
              />
              <MarketplaceCatalog
                singleColumn
                items={catalog.filter((item) =>
                  (item.name + ' ' + item.description)
                    .toLowerCase()
                    .includes(search.trim().toLowerCase()),
                )}
                selectedIds={new Set(selected.map((tool) => 'tool:' + tool.id))}
                onToggle={selectTool}
              />
            </section>
          )}
          {view === 'config' && (
            <>
              <div className="mb-3">
                <AgentModelField id={modelId} onSelect={() => setView('model')} />
              </div>
              <Instructions inlineOnly />
              <SelectedSection
                title={t('com_ui_tools_section_title')}
                addLabel={t('com_ui_add_tools')}
                emptyLabel={t('com_ui_tools_empty')}
                emptyHint={t('com_ui_tools_empty_hint')}
                items={selected}
                onAdd={openTools}
                onRemove={selectTool}
              />
            </>
          )}
        </fieldset>
        {current && (
          <p className="text-text-secondary text-xs">
            {current.reference.startsWith('action:') ? '' : t('com_project_tool_disclosure') + ' '}
            {current.data_notice}
          </p>
        )}
        {stale && dirty && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
            {t('com_trials_changed')}
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                reset(defaults(draft.config!));
                setBase(draft);
              }}
            >
              {t('com_assets_refresh')}
            </Button>
          </div>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={pending || !dirty || !valid || stale || !base.digest}
        >
          {t('com_trials_save')}
        </Button>
      </form>
    </FormProvider>
  );
}
