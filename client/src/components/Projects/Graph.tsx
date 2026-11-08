import { useEffect, useMemo, useState } from 'react';
import { Cpu, Database, MessageCircle, ArrowRight, CornerUpLeft } from 'lucide-react';
import {
  ReactFlow,
  Controls,
  Position,
  Handle,
  MarkerType,
  useReactFlow,
  useNodesInitialized,
} from '@xyflow/react';
import type { Edge, Node, NodeProps, NodeMouseHandler, XYPosition } from '@xyflow/react';
import type { AITrials } from 'librechat-data-provider';
import type { Activity, Status } from './Activity';
import { useLocalize } from '~/hooks';
import '@xyflow/react/dist/style.css';

export type GraphNode = 'input' | 'assistant' | 'knowledge' | 'result' | 'answer';
type Layout = Partial<Record<GraphNode, XYPosition>>;
type FlowNode = Node<{
  label: string;
  detail?: string;
  status?: Status;
  editable: boolean;
  icon: typeof Cpu;
}>;
const indicators = {
  running: { label: 'com_project_graph_running', glyph: '…' },
  done: { label: 'com_project_graph_done', glyph: '✓' },
  failed: { label: 'com_trials_failed', glyph: '!' },
  waiting: { label: 'com_project_graph_waiting', glyph: '…' },
  stopped: { label: 'com_project_graph_stopped', glyph: '■' },
} as const;
type Props = {
  layoutKey: string;
  draft?: AITrials;
  activity?: Activity;
  onEdit: (id: 'assistant' | 'knowledge') => void;
};

function Step({ data }: NodeProps<FlowNode>) {
  const t = useLocalize();
  const Icon = data.icon;
  return (
    <div
      data-status={data.status ?? 'idle'}
      className={`bg-surface-primary text-text-primary w-[126px] rounded-md border px-2 py-2 text-xs ${data.status === 'running' ? 'border-text-primary ring-border-heavy ring-1' : 'border-border-light'} ${data.editable ? 'cursor-pointer' : ''}`}
    >
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="target" position={Position.Top} id="feedback" />
      <div className="flex items-center gap-1.5">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="flex-1 truncate font-medium">{data.label}</span>
        {data.status && (
          <span
            role="status"
            aria-label={t(indicators[data.status].label)}
            title={t(indicators[data.status].label)}
          >
            {indicators[data.status].glyph}
          </span>
        )}
      </div>
      {data.detail && (
        <div className="text-text-secondary text-3xs mt-1 truncate" title={data.detail}>
          {data.detail}
        </div>
      )}
      <Handle type="source" position={Position.Right} id="out" />
      <Handle type="source" position={Position.Bottom} id="call" />
    </div>
  );
}
const nodeTypes = { step: Step };

function Fit({ knowledge }: { knowledge: boolean }) {
  const ready = useNodesInitialized();
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (ready) void fitView({ padding: 0.2, maxZoom: 1 });
  }, [ready, knowledge, fitView]);
  return null;
}

function readLayout(key: string): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
    return Object.fromEntries(
      ['input', 'assistant', 'knowledge', 'result', 'answer'].flatMap((id) => {
        const point = raw?.[id];
        return Number.isFinite(point?.x) && Number.isFinite(point?.y) ? [[id, point]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export default function Graph({ layoutKey, draft, activity, onEdit }: Props) {
  const t = useLocalize();
  // The previous dependency-only layout remains available; this layout has extra loop nodes.
  const key = 'starbridge:assistant-loop-layout:' + layoutKey;
  const [layout, setLayout] = useState(() => readLayout(key));
  const [dragging, setDragging] = useState<Layout>({});
  const nodes = useMemo(() => {
    const make = (
      id: GraphNode,
      x: number,
      y: number,
      icon: typeof Cpu,
      label: string,
      detail?: string,
    ): FlowNode => ({
      id,
      type: 'step',
      position: dragging[id] ?? layout[id] ?? { x, y },
      ariaLabel: label,
      data: {
        label,
        detail,
        icon,
        editable: id === 'assistant' || id === 'knowledge',
        status: id === 'input' ? undefined : activity?.[id],
      },
    });
    const result = [
      make('input', 0, 0, ArrowRight, t('com_project_graph_input')),
      make('assistant', 180, 0, Cpu, 'LLM', draft?.config?.model),
      make('answer', 360, 0, MessageCircle, t('com_project_graph_answer')),
    ];
    if (draft?.knowledge_revision_id) {
      result.push(
        make(
          'knowledge',
          120,
          112,
          Database,
          t('com_project_graph_search'),
          activity?.calls
            ? t('com_project_graph_calls', { count: activity.calls })
            : t('com_project_graph_on_demand'),
        ),
        make('result', 330, 112, CornerUpLeft, t('com_project_graph_result')),
      );
    }
    return result;
  }, [activity, draft?.config?.model, draft?.knowledge_revision_id, dragging, layout, t]);
  const edge = (
    id: string,
    source: string,
    target: string,
    active: boolean,
    label?: string,
    sourceHandle = 'out',
    targetHandle = 'in',
  ): Edge => ({
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    label,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      stroke: active ? 'var(--text-primary)' : 'var(--border-heavy)',
      strokeWidth: active ? 2 : 1.5,
    },
    labelStyle: { fill: 'var(--text-secondary)', fontSize: 10 },
    labelBgStyle: { fill: 'var(--surface-canvas)' },
    focusable: false,
  });
  const edges: Edge[] = [
    edge('input-assistant', 'input', 'assistant', !!activity),
    edge('assistant-answer', 'assistant', 'answer', !!activity?.answer),
  ];
  if (draft?.knowledge_revision_id) {
    edges.push(
      edge(
        'assistant-knowledge',
        'assistant',
        'knowledge',
        !!activity?.calls,
        t('com_project_graph_call'),
        'call',
        'feedback',
      ),
      edge('knowledge-result', 'knowledge', 'result', !!activity?.result),
      edge(
        'result-assistant',
        'result',
        'assistant',
        !!activity?.result,
        t('com_project_graph_feedback'),
        'out',
        'feedback',
      ),
    );
  }
  const open: NodeMouseHandler<FlowNode> = (_event, node) => {
    if (node.id === 'assistant' || node.id === 'knowledge') onEdit(node.id);
  };
  return (
    <div className="min-h-0 flex-1" aria-label={t('com_project_graph')}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.25}
        maxZoom={2}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={open}
        onNodeDragStart={() =>
          document.activeElement instanceof HTMLElement && document.activeElement.blur()
        }
        onNodesChange={(changes) => {
          const positions: Layout = {};
          for (const change of changes) {
            if (change.type === 'position' && change.position)
              positions[change.id as GraphNode] = change.position;
          }
          if (Object.keys(positions).length === 0) return;
          setDragging((current) => ({ ...current, ...positions }));
        }}
        onNodeDragStop={(_event, node) => {
          const next = { ...layout, [node.id]: node.position };
          setDragging({});
          setLayout(next);
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch {
            /* Browser storage may be disabled; the in-memory layout still works. */
          }
        }}
      >
        <Fit knowledge={!!draft?.knowledge_revision_id} />
        <Controls
          showInteractive={false}
          position="bottom-right"
          className="[&_button]:border-border-light! [&_button]:bg-surface-primary! [&_button]:text-text-primary! [&_button:hover]:bg-surface-hover! shadow-none!"
        />
      </ReactFlow>
    </div>
  );
}
