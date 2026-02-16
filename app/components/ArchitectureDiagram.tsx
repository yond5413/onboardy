'use client';

import { memo } from 'react';
import { NodeProps, Handle, Position, ReactFlow, Background, Controls, MiniMap, BackgroundVariant, useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge, NodeTypes } from '@xyflow/react';

import '@xyflow/react/dist/style.css';

export interface DiagramNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  details?: Record<string, string>;
  nodeType?: 'service' | 'database' | 'client' | 'external' | 'gateway';
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
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-blue-400 bg-blue-800 shadow-blue-500/50'
          : 'border-blue-600 bg-blue-950 hover:bg-blue-900/50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-3 !h-3" />
      <div className="text-blue-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-blue-300/80 text-xs mt-1.5 font-normal">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-3 !h-3" />
    </div>
  );
});

const DatabaseNode = memo(function DatabaseNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-emerald-400 bg-emerald-800 shadow-emerald-500/50'
          : 'border-emerald-600 bg-emerald-950 hover:bg-emerald-900/50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-emerald-400 !w-3 !h-3" />
      <div className="text-emerald-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-emerald-300/80 text-xs mt-1.5 font-normal">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-3 !h-3" />
    </div>
  );
});

const ClientNode = memo(function ClientNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-purple-400 bg-purple-800 shadow-purple-500/50'
          : 'border-purple-600 bg-purple-950 hover:bg-purple-900/50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-purple-400 !w-3 !h-3" />
      <div className="text-purple-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-purple-300/80 text-xs mt-1.5 font-normal">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-purple-400 !w-3 !h-3" />
    </div>
  );
});

const ExternalNode = memo(function ExternalNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-orange-400 bg-orange-800 shadow-orange-500/50'
          : 'border-orange-600 bg-orange-950 hover:bg-orange-900/50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-orange-400 !w-3 !h-3" />
      <div className="text-orange-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-orange-300/80 text-xs mt-1.5 font-normal">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-orange-400 !w-3 !h-3" />
    </div>
  );
});

const GatewayNode = memo(function GatewayNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-red-400 bg-red-800 shadow-red-500/50'
          : 'border-red-600 bg-red-950 hover:bg-red-900/50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-red-400 !w-3 !h-3" />
      <div className="text-red-100 font-semibold text-sm tracking-wide">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-red-300/80 text-xs mt-1.5 font-normal">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-red-400 !w-3 !h-3" />
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
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick = (_: React.MouseEvent, node: Node<DiagramNodeData>) => {
    if (onNodeClick) {
      onNodeClick(node);
    }
  };

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
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.1, maxZoom: 1.5 }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-right"
        defaultEdgeOptions={{
          animated: true,
          style: { strokeWidth: 2 },
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
        <Legend />
      </ReactFlow>
    </div>
  );
}

export default ArchitectureDiagram;
