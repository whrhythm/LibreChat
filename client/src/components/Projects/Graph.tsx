import { useMemo, useState } from 'react';
import { ReactFlow, Controls, Position } from '@xyflow/react';
import { Bot, Database, MessageCircle, ArrowRight } from 'lucide-react';
import type { Edge, Node, NodeMouseHandler, XYPosition } from '@xyflow/react';
import type { AITrials } from 'librechat-data-provider';
import type { Activity } from './Activity';
import { useLocalize } from '~/hooks';
import '@xyflow/react/dist/style.css';

export type GraphNode = 'input' | 'assistant' | 'knowledge' | 'answer';
type Layout = Partial<Record<GraphNode, XYPosition>>;
const indicators = {
  running: { label: 'com_ui_loading', glyph: '…' },
  done: { label: 'com_project_graph_done', glyph: '✓' },
  failed: { label: 'com_trials_failed', glyph: '!' },
} as const;
type Props = {
  layoutKey: string;
  draft?: AITrials;
  activity?: Activity;
  onEdit: (id: 'assistant' | 'knowledge') => void;
};

function readLayout(key: string): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
    return Object.fromEntries(
      ['input', 'assistant', 'knowledge', 'answer'].flatMap((id) => {
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
  const key = 'starbridge:assistant-layout:' + layoutKey;
  const [layout, setLayout] = useState(() => readLayout(key));
  const [dragging, setDragging] = useState<Layout>({});
  const nodes = useMemo(() => {
    const make = (id: GraphNode, x: number, y: number, icon: typeof Bot, label: string): Node => {
      const Icon = icon;
      const status = id === 'assistant' || id === 'knowledge' ? activity?.[id] : undefined;
      return {
        id,
        position: dragging[id] ?? layout[id] ?? { x, y },
        sourcePosition: id === 'knowledge' ? Position.Top : Position.Right,
        targetPosition: Position.Left,
        ariaLabel: label,
        className:
          '!bg-surface-primary !border-border-light !text-text-primary !w-[112px] !rounded-md !p-2 !text-sm',
        data: {
          label: (
            <span className="flex items-center justify-center gap-2">
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
              {status && (
                <span
                  role="status"
                  title={t(indicators[status].label)}
                  className={status === 'running' ? 'motion-safe:animate-pulse' : undefined}
                >
                  {indicators[status].glyph}
                </span>
              )}
            </span>
          ),
        },
      };
    };
    const result = [
      make('input', 0, 0, ArrowRight, t('com_project_graph_input')),
      make('assistant', 148, 0, Bot, t('com_project_graph_assistant')),
      make('answer', 296, 0, MessageCircle, t('com_project_graph_answer')),
    ];
    if (draft?.knowledge_revision_id) {
      result.push(make('knowledge', 148, 70, Database, t('com_knowledge_title')));
    }
    return result;
  }, [activity, draft?.knowledge_revision_id, dragging, layout, t]);
  const edges: Edge[] = [
    { id: 'input-assistant', source: 'input', target: 'assistant' },
    { id: 'assistant-answer', source: 'assistant', target: 'answer' },
  ];
  if (draft?.knowledge_revision_id) {
    edges.push({
      id: 'knowledge-assistant',
      source: 'knowledge',
      target: 'assistant',
      style: { strokeDasharray: '4 4' },
    });
  }
  const open: NodeMouseHandler = (_event, node) => {
    if (node.id === 'assistant' || node.id === 'knowledge') onEdit(node.id);
  };
  return (
    <div className="min-h-0 flex-1" aria-label={t('com_project_graph')}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
        minZoom={0.35}
        maxZoom={2}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={open}
        onNodesChange={(changes) => {
          const positions: Layout = {};
          for (const change of changes) {
            if (change.type === 'position' && change.position) {
              positions[change.id as GraphNode] = change.position;
            }
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
            // The in-memory layout still works when browser storage is disabled.
          }
        }}
      >
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
