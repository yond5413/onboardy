'use client';

import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { NodeProps, Handle, Position, ReactFlow, Background, Controls, MiniMap, BackgroundVariant, Panel, useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge, NodeTypes } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { RotateCcw } from 'lucide-react';

import '@xyflow/react/dist/style.css';

export interface DiagramNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  details?: Record<string, string>;
  nodeType?: 'service' | 'database' | 'client' | 'external' | 'gateway';
}

const MAX_DESCRIPTION_LENGTH = 72;

/** Estimated node width for dagre layout computation */
const NODE_WIDTH = 200;
/** Estimated node height for dagre layout computation */
const NODE_HEIGHT = 80;

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

/**
 * Compute a hierarchical top-to-bottom layout using dagre.
 * Dagre handles layer assignment, edge-crossing minimization, and node spacing
 * automatically — producing layouts similar to mermaid flowcharts.
 */
function computeDagreLayout(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[]
): Node<DiagramNodeData>[] {
  if (!nodes.length) return nodes;

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: 'TB',
    nodesep: 80,
    ranksep: 100,
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
      // Dagre positions are center-anchored; shift to top-left for React Flow
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    };
  });
}

function normalizeArchitectureEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    animated: false,
    type: 'smoothstep',
    label: typeof edge.label === 'string' ? truncateText(edge.label, 20) : undefined,
    labelStyle: {
      fontSize: 10,
      fill: '#94a3b8',
      fontWeight: 500,
    },
    style: {
      strokeWidth: 1.75,
      stroke: '#64748b',
      opacity: 0.9,
      ...(edge.style || {}),
    },
  }));
}

interface LegendItem {
  type: string;
  color: string;
  bgColor: string;
  label: string;
}

const legendItems: LegendItem[] = [
  { type: 'gateway', color: 'text-red-300', bgColor: 'bg-red-600', label: 'Gateway' },
  { type: 'client', color: 'text-purple-300', bgColor: 'bg-purple-600', label: 'Client' },
  { type: 'service', color: 'text-blue-300', bgColor: 'bg-blue-600', label: 'Service' },
  { type: 'database', color: 'text-emerald-300', bgColor: 'bg-emerald-600', label: 'Database' },
  { type: 'external', color: 'text-orange-300', bgColor: 'bg-orange-600', label: 'External' },
];

function Legend() {
  return (
    <div className="absolute top-4 right-4 z-10 bg-slate-800/90 backdrop-blur-sm border border-slate-600 rounded-lg p-3 shadow-xl">
      <div className="text-slate-200 font-semibold text-xs uppercase tracking-wide mb-2 border-b border-slate-600 pb-1">
        Node Types
      </div>
      <div className="flex flex-col gap-1.5">
        {legendItems.map((item) => (
          <div key={item.type} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${item.bgColor}`} />
            <span className={`text-xs ${item.color}`}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Custom node components with styling for each type
const ServiceNode = memo(function ServiceNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  const description = nodeData.description ? truncateText(nodeData.description, MAX_DESCRIPTION_LENGTH) : undefined;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-blue-400 bg-blue-800 shadow-blue-500/50'
          : 'border-blue-600 bg-blue-950 hover:bg-blue-900/50'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-400 !w-3 !h-3" />
      <div className="text-blue-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {description && (
        <div className="text-blue-300/80 text-xs mt-1.5 font-normal">{description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-3 !h-3" />
    </div>
  );
});

const DatabaseNode = memo(function DatabaseNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  const description = nodeData.description ? truncateText(nodeData.description, MAX_DESCRIPTION_LENGTH) : undefined;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-emerald-400 bg-emerald-800 shadow-emerald-500/50'
          : 'border-emerald-600 bg-emerald-950 hover:bg-emerald-900/50'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-emerald-400 !w-3 !h-3" />
      <div className="text-emerald-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {description && (
        <div className="text-emerald-300/80 text-xs mt-1.5 font-normal">{description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-400 !w-3 !h-3" />
    </div>
  );
});

const ClientNode = memo(function ClientNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  const description = nodeData.description ? truncateText(nodeData.description, MAX_DESCRIPTION_LENGTH) : undefined;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-purple-400 bg-purple-800 shadow-purple-500/50'
          : 'border-purple-600 bg-purple-950 hover:bg-purple-900/50'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-400 !w-3 !h-3" />
      <div className="text-purple-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {description && (
        <div className="text-purple-300/80 text-xs mt-1.5 font-normal">{description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400 !w-3 !h-3" />
    </div>
  );
});

const ExternalNode = memo(function ExternalNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  const description = nodeData.description ? truncateText(nodeData.description, MAX_DESCRIPTION_LENGTH) : undefined;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-orange-400 bg-orange-800 shadow-orange-500/50'
          : 'border-orange-600 bg-orange-950 hover:bg-orange-900/50'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-orange-400 !w-3 !h-3" />
      <div className="text-orange-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {description && (
        <div className="text-orange-300/80 text-xs mt-1.5 font-normal">{description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-orange-400 !w-3 !h-3" />
    </div>
  );
});

const GatewayNode = memo(function GatewayNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  const description = nodeData.description ? truncateText(nodeData.description, MAX_DESCRIPTION_LENGTH) : undefined;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-red-400 bg-red-800 shadow-red-500/50'
          : 'border-red-600 bg-red-950 hover:bg-red-900/50'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-400 !w-3 !h-3" />
      <div className="text-red-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {description && (
        <div className="text-red-300/80 text-xs mt-1.5 font-normal">{description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-red-400 !w-3 !h-3" />
    </div>
  );
});

// Node type mapping
const nodeTypes: NodeTypes = {
  service: ServiceNode,
  database: DatabaseNode,
  client: ClientNode,
  external: ExternalNode,
  gateway: GatewayNode,
};

export interface ArchitectureDiagramProps {
  nodes: Node<DiagramNodeData>[];
  edges: Edge[];
  onNodeClick?: (node: Node<DiagramNodeData>) => void;
  darkMode?: boolean;
  height?: string;
}

export function ArchitectureDiagram({
  nodes: initialNodes,
  edges: initialEdges,
  onNodeClick,
  darkMode = true,
  height = '600px',
}: ArchitectureDiagramProps) {
  const layoutedNodes = useMemo(
    () => computeDagreLayout(initialNodes, initialEdges),
    [initialNodes, initialEdges]
  );
  const layoutedEdges = useMemo(
    () => normalizeArchitectureEdges(initialEdges),
    [initialEdges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);
  const previousNodeIdsRef = useRef<Set<string>>(
    new Set(layoutedNodes.map((n: Node<DiagramNodeData>) => n.id))
  );

  // Only reset node positions if the node structure actually changed (new/removed nodes)
  // This preserves user-dragged positions when the same diagram is re-rendered
  useEffect(() => {
    const currentNodeIds = new Set(layoutedNodes.map((n: Node<DiagramNodeData>) => n.id));
    const previousNodeIds = previousNodeIdsRef.current;
    
    // Check if structure changed: different number of nodes or different IDs
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
        onNodeClick(node as Node<DiagramNodeData>);
      }
    },
    [onNodeClick]
  );

  const darkThemeStyles = darkMode
    ? {
        '--xy-edge-stroke': '#94a3b8',
        '--xy-edge-stroke-selected': '#60a5fa',
        '--xy-connectionline-stroke': '#60a5fa',
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
    <div className="architecture-diagram relative" style={{ width: '100%', height }}>
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
          animated: false,
          style: { strokeWidth: 1.75, stroke: '#64748b' },
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
            switch (node.data?.nodeType) {
              case 'service': return '#3b82f6';
              case 'database': return '#10b981';
              case 'client': return '#a855f7';
              case 'external': return '#f97316';
              case 'gateway': return '#ef4444';
              default: return '#64748b';
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

export default ArchitectureDiagram;
