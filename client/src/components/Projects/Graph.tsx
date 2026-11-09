import { useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  useNodesState,
  useNodesInitialized,
  useReactFlow,
  useStore,
  getViewportForBounds,
} from '@xyflow/react';
import type { Node, NodeProps, Edge } from '@xyflow/react';
import type { TraceStep } from './Trace';
import { useLocalize } from '~/hooks';
import '@xyflow/react/dist/style.css';

const labels = {
  submitted: 'com_project_trace_submitted',
  model: 'com_project_trace_model',
  call: 'com_project_trace_call',
  tool: 'com_project_trace_execute',
  result: 'com_project_trace_result',
  answer: 'com_project_graph_answer',
  failed: 'com_trials_failed',
  stopped: 'com_project_graph_stopped',
} as const;

const states = {
  running: 'com_project_graph_running',
  done: 'com_project_graph_done',
  failed: 'com_trials_failed',
  waiting: 'com_project_graph_waiting',
  stopped: 'com_project_graph_stopped',
} as const;

type TraceNode = Node<{ step: TraceStep; index: number; name?: string; label: string }, 'trace'>;

function Step({ data }: NodeProps<TraceNode>) {
  const t = useLocalize();
  const { step, index, name, label } = data;
  const side = Math.floor(index / 3) % 2 ? Position.Left : Position.Right;
  const reverse = side === Position.Left ? Position.Right : Position.Left;
  return (
    <div
      data-status={step.status ?? 'observed'}
      className="bg-surface-primary border-border-light text-text-primary flex h-[54px] w-[144px] flex-col justify-center rounded-md border px-2 text-xs"
    >
      {index > 0 && (
        <Handle
          type="target"
          position={index % 3 === 0 ? Position.Top : reverse}
          isConnectable={false}
        />
      )}
      <div className="flex items-center gap-1">
        <span className="text-text-secondary tabular-nums">{index + 1}</span>
        <span className="truncate font-medium" title={label}>
          {label}
        </span>
      </div>
      <div className="text-text-secondary flex min-w-0 items-center gap-1">
        {name && (
          <span className="min-w-0 flex-1 truncate" title={name}>
            {name}
          </span>
        )}
        {step.status && <span className="shrink-0">{t(states[step.status])}</span>}
      </div>
      <Handle
        type="source"
        position={index % 3 === 2 ? Position.Bottom : side}
        isConnectable={false}
      />
    </div>
  );
}
const types = { trace: Step };
const empty: TraceStep[] = [];

function Fit({ count }: { count: number }) {
  const ready = useNodesInitialized();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const { getNodesBounds, getNodes, setViewport, viewportInitialized } = useReactFlow();
  useEffect(() => {
    if (ready && count && width && height && viewportInitialized) {
      void setViewport(
        getViewportForBounds(getNodesBounds(getNodes()), width, height, 0.2, 1, 0.15),
      );
    }
  }, [ready, count, width, height, getNodesBounds, getNodes, setViewport, viewportInitialized]);
  return null;
}

export default function Graph({
  trace = empty,
  toolName,
}: {
  trace?: TraceStep[];
  toolName?: string;
}) {
  const t = useLocalize();
  const initial = useMemo(
    () =>
      trace.map((step, index): TraceNode => {
        const row = Math.floor(index / 3);
        const col = row % 2 ? 2 - (index % 3) : index % 3;
        const label = t(labels[step.kind]);
        let name: string | undefined;
        if (step.tool === 'knowledge') name = t('com_project_graph_search');
        if (step.tool === 'reviewed') name = toolName ?? t('com_project_reviewed_tool');
        return {
          id: index + '-' + step.kind,
          type: 'trace',
          position: { x: col * 185, y: row * 95 },
          data: { step, index, label, name },
          ariaLabel: [label, name].filter(Boolean).join(' '),
        };
      }),
    [trace, toolName, t],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initial);
  useEffect(() => {
    setNodes((current) =>
      initial.map((node, index) => {
        const previous = current[index];
        return previous?.id === node.id
          ? { ...previous, data: node.data, ariaLabel: node.ariaLabel }
          : node;
      }),
    );
  }, [initial, setNodes]);
  const edges: Edge[] = initial.slice(1).map((node, index) => ({
    id: node.id,
    source: initial[index].id,
    target: node.id,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: 'rgb(var(--text-secondary))' },
    style: { stroke: 'rgb(var(--text-secondary))' },
    focusable: false,
  }));
  if (!initial.length) {
    return (
      <div className="text-text-secondary grid h-full place-items-center px-3 text-center text-sm">
        {t('com_project_trace_empty')}
      </div>
    );
  }
  return (
    <div aria-label={t('com_project_graph')} className="h-full min-h-0 overflow-clip">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={types}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        autoPanOnNodeFocus={false}
        autoPanOnNodeDrag={false}
        nodeDragThreshold={5}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgb(var(--border-light))" gap={18} />
        <Fit count={nodes.length} />
        <Controls
          showInteractive={false}
          position="bottom-right"
          className="[&_button]:border-border-light! [&_button]:bg-surface-primary! [&_button]:text-text-primary!"
        />
      </ReactFlow>
    </div>
  );
}
