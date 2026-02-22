'use client';

import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  NodeProps,
  Handle,
  Position,
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Panel,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import type { Node, Edge, NodeTypes } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { RotateCcw } from 'lucide-react';

import '@xyflow/react/dist/style.css';

// Strip React Flow's default node wrapper styles so our custom nodes
// render without a double-border / white-background artefact
const nodeWrapperStyle = `
  .data-flow-diagram .react-flow__node {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    box-shadow: none;
  }
  .data-flow-diagram .react-flow__node.selected > div,
  .data-flow-diagram .react-flow__node:focus > div {
    outline: none;
  }
`;

export interface DataFlowNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  nodeType?: string;
}

const MAX_DESCRIPTION_LENGTH = 60;

/** Estimated node width for dagre layout computation */
const NODE_WIDTH = 180;
/** Estimated node height for dagre layout computation */
const NODE_HEIGHT = 70;

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

/**
 * Compute a hierarchical left-to-right layout using dagre.
 * Data flows are naturally sequential (user action -> response), so LR
 * direction produces the most intuitive reading order.
 */
function computeDagreLayout(
  nodes: Node<DataFlowNodeData>[],
  edges: Edge[]
): Node<DataFlowNodeData>[] {
  if (!nodes.length) return nodes;

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: 'LR',
    nodesep: 60,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    };
  });
}

/** Enhance edges with animated arrows for data flow visualization */
function normalizeDataFlowEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    animated: true,
    type: 'smoothstep',
    label: typeof edge.label === 'string' ? truncateText(edge.label, 24) : undefined,
    labelStyle: {
      fontSize: 10,
      fill: '#94a3b8',
      fontWeight: 500,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: '#64748b',
    },
    style: {
      strokeWidth: 2,
      stroke: '#64748b',
      opacity: 0.9,
      ...(edge.style || {}),
    },
  }));
}

// ── Custom node components ──────────────────────────────────────────────────

const DataServiceNode = memo(function DataServiceNode({ data, selected }: NodeProps) {
  const nodeData = data as DataFlowNodeData;
  const description = nodeData.description ? truncateText(nodeData.description, MAX_DESCRIPTION_LENGTH) : undefined;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[150px] text-center transition-all ${
        selected
          ? 'border-cyan-400 bg-cyan-800 shadow-cyan-500/50'
          : 'border-cyan-600 bg-cyan-950 hover:bg-cyan-900/50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-cyan-400 !w-3 !h-3" />
      <div className="text-cyan-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {description && (
        <div className="text-cyan-300/80 text-xs mt-1.5 font-normal">{description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-cyan-400 !w-3 !h-3" />
    </div>
  );
});

const DataStoreNode = memo(function DataStoreNode({ data, selected }: NodeProps) {
  const nodeData = data as DataFlowNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-full border-2 shadow-lg min-w-[130px] text-center transition-all ${
        selected
          ? 'border-emerald-400 bg-emerald-800 shadow-emerald-500/50'
          : 'border-emerald-600 bg-emerald-950 hover:bg-emerald-900/50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-emerald-400 !w-3 !h-3" />
      <div className="text-emerald-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-3 !h-3" />
    </div>
  );
});

const DataClientNode = memo(function DataClientNode({ data, selected }: NodeProps) {
  const nodeData = data as DataFlowNodeData;
  const description = nodeData.description ? truncateText(nodeData.description, MAX_DESCRIPTION_LENGTH) : undefined;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[130px] text-center transition-all ${
        selected
          ? 'border-violet-400 bg-violet-800 shadow-violet-500/50'
          : 'border-violet-600 bg-violet-950 hover:bg-violet-900/50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-violet-400 !w-3 !h-3" />
      <div className="text-violet-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {description && (
        <div className="text-violet-300/80 text-xs mt-1.5 font-normal">{description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-violet-400 !w-3 !h-3" />
    </div>
  );
});

const DataTransformNode = memo(function DataTransformNode({ data, selected }: NodeProps) {
  const nodeData = data as DataFlowNodeData;
  const description = nodeData.description ? truncateText(nodeData.description, MAX_DESCRIPTION_LENGTH) : undefined;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[130px] text-center transition-all ${
        selected
          ? 'border-amber-400 bg-amber-800 shadow-amber-500/50'
          : 'border-amber-600 bg-amber-950 hover:bg-amber-900/50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-400 !w-3 !h-3" />
      <div className="text-amber-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {description && (
        <div className="text-amber-300/80 text-xs mt-1.5 font-normal">{description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-amber-400 !w-3 !h-3" />
    </div>
  );
});

// Node type mapping — matches the type keys the AI agent emits for data flow
const nodeTypes: NodeTypes = {
  service: DataServiceNode,
  default: DataServiceNode,
  database: DataStoreNode,
  client: DataClientNode,
  external: DataTransformNode,
  gateway: DataServiceNode,
  input: DataClientNode,
  output: DataClientNode,
};

// ── Legend ───────────────────────────────────────────────────────────────────

interface LegendItem {
  color: string;
  bgColor: string;
  label: string;
}

const legendItems: LegendItem[] = [
  { color: 'text-violet-300', bgColor: 'bg-violet-600', label: 'Input / Output' },
  { color: 'text-cyan-300', bgColor: 'bg-cyan-600', label: 'Processing' },
  { color: 'text-emerald-300', bgColor: 'bg-emerald-600', label: 'Data Store' },
  { color: 'text-amber-300', bgColor: 'bg-amber-600', label: 'Transform' },
];

function Legend() {
  return (
    <div className="absolute top-4 right-4 z-10 bg-slate-800/90 backdrop-blur-sm border border-slate-600 rounded-lg p-3 shadow-xl">
      <div className="text-slate-200 font-semibold text-xs uppercase tracking-wide mb-2 border-b border-slate-600 pb-1">
        Data Flow
      </div>
      <div className="flex flex-col gap-1.5">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${item.bgColor}`} />
            <span className={`text-xs ${item.color}`}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export interface DataFlowDiagramProps {
  nodes: Node<DataFlowNodeData>[];
  edges: Edge[];
  onNodeClick?: (node: Node<DataFlowNodeData>) => void;
  darkMode?: boolean;
  height?: string;
}

export function DataFlowDiagram({
  nodes: initialNodes,
  edges: initialEdges,
  onNodeClick,
  darkMode = true,
  height = '600px',
}: DataFlowDiagramProps) {
  const layoutedNodes = useMemo(
    () => computeDagreLayout(initialNodes, initialEdges),
    [initialNodes, initialEdges]
  );
  const layoutedEdges = useMemo(
    () => normalizeDataFlowEdges(initialEdges),
    [initialEdges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);
  const previousNodeIdsRef = useRef<Set<string>>(
    new Set(layoutedNodes.map((n: Node<DataFlowNodeData>) => n.id))
  );

  // Only reset positions when the node structure changes (new/removed nodes)
  useEffect(() => {
    const currentNodeIds = new Set(layoutedNodes.map((n: Node<DataFlowNodeData>) => n.id));
    const previousNodeIds = previousNodeIdsRef.current;

    const structureChanged =
      currentNodeIds.size !== previousNodeIds.size ||
      [...currentNodeIds].some((id: string) => !previousNodeIds.has(id)) ||
      [...previousNodeIds].some((id: string) => !currentNodeIds.has(id));

    if (structureChanged) {
      setNodes(layoutedNodes);
      previousNodeIdsRef.current = currentNodeIds;
    }
  }, [layoutedNodes, setNodes]);

  useEffect(() => {
    setEdges(layoutedEdges);
  }, [layoutedEdges, setEdges]);

  /** Reset all nodes to their dagre-computed positions */
  const handleResetLayout = useCallback(() => {
    setNodes(computeDagreLayout(initialNodes, initialEdges));
  }, [initialNodes, initialEdges, setNodes]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node as Node<DataFlowNodeData>);
      }
    },
    [onNodeClick]
  );

  const darkThemeStyles = darkMode
    ? {
        '--xy-edge-stroke': '#94a3b8',
        '--xy-edge-stroke-selected': '#22d3ee',
        '--xy-connectionline-stroke': '#22d3ee',
        '--xy-handle-background': '#64748b',
        '--xy-handle-border-color': '#94a3b8',
        '--xy-minimap-background': '#1e293b',
        '--xy-minimap-mask-background': '#0f172a',
        '--xy-minimap-mask-stroke': '#475569',
        '--xy-controls-button-background': '#1e293b',
        '--xy-controls-button-color': '#e2e8f0',
        '--xy-controls-button-border-color': '#334155',
        '--xy-controls-button-background-hover': '#334155',
        '--xy-attribution-background': 'rgba(30, 41, 59, 0.8)',
        '--xy-attribution-color': '#94a3b8',
      } as React.CSSProperties
    : {};

  return (
    <div className="data-flow-diagram relative" style={{ width: '100%', height }}>
      <style>{nodeWrapperStyle}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        nodesDraggable={true}
        fitView
        fitViewOptions={{ padding: 0.3, minZoom: 0.2, maxZoom: 1.5 }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-right"
        defaultEdgeOptions={{
          animated: true,
          style: { strokeWidth: 2, stroke: '#64748b' },
          type: 'smoothstep',
        }}
        style={darkThemeStyles}
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          color={darkMode ? '#334155' : '#e2e8f0'}
        />
        <Controls className={darkMode ? 'bg-slate-800 border-slate-600' : ''} />
        <MiniMap
          nodeColor={(node) => {
            switch (node.data?.nodeType ?? node.type) {
              case 'client':
              case 'input':
              case 'output':
                return '#8b5cf6'; // violet
              case 'service':
              case 'default':
              case 'gateway':
                return '#06b6d4'; // cyan
              case 'database':
                return '#10b981'; // emerald
              case 'external':
                return '#f59e0b'; // amber
              default:
                return '#64748b';
            }
          }}
          maskColor={darkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.7)'}
          className="bg-slate-900/80"
        />
        <Panel position="top-left">
          <button
            onClick={handleResetLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700 hover:text-slate-100 shadow-sm"
            title="Reset to auto-layout"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Layout
          </button>
        </Panel>
        <Legend />
      </ReactFlow>
    </div>
  );
}

export default DataFlowDiagram;
