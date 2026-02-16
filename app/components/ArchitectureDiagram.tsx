'use client';

import { memo } from 'react';
import { NodeProps, Handle, Position } from '@xyflow/react';
import { ReactFlowDiagram, DiagramNodeData } from './ReactFlowDiagram';
import type { Node, Edge, NodeTypes } from '@xyflow/react';

// Custom node components with styling for each type
const ServiceNode = memo(function ServiceNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[140px] text-center transition-all ${
        selected
          ? 'border-blue-400 bg-blue-900/40 shadow-blue-500/50'
          : 'border-blue-500 bg-blue-900/20 hover:bg-blue-900/30'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-400" />
      <div className="text-blue-200 font-semibold text-sm">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-blue-300/70 text-xs mt-1">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400" />
    </div>
  );
});

const DatabaseNode = memo(function DatabaseNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[140px] text-center transition-all ${
        selected
          ? 'border-emerald-400 bg-emerald-900/40 shadow-emerald-500/50'
          : 'border-emerald-500 bg-emerald-900/20 hover:bg-emerald-900/30'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-emerald-400" />
      <div className="text-emerald-200 font-semibold text-sm">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-emerald-300/70 text-xs mt-1">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-400" />
    </div>
  );
});

const ClientNode = memo(function ClientNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[140px] text-center transition-all ${
        selected
          ? 'border-purple-400 bg-purple-900/40 shadow-purple-500/50'
          : 'border-purple-500 bg-purple-900/20 hover:bg-purple-900/30'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-400" />
      <div className="text-purple-200 font-semibold text-sm">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-purple-300/70 text-xs mt-1">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400" />
    </div>
  );
});

const ExternalNode = memo(function ExternalNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[140px] text-center transition-all ${
        selected
          ? 'border-orange-400 bg-orange-900/40 shadow-orange-500/50'
          : 'border-orange-500 bg-orange-900/20 hover:bg-orange-900/30'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-orange-400" />
      <div className="text-orange-200 font-semibold text-sm">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-orange-300/70 text-xs mt-1">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-orange-400" />
    </div>
  );
});

const GatewayNode = memo(function GatewayNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[140px] text-center transition-all ${
        selected
          ? 'border-red-400 bg-red-900/40 shadow-red-500/50'
          : 'border-red-500 bg-red-900/20 hover:bg-red-900/30'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-400" />
      <div className="text-red-200 font-semibold text-sm">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-red-300/70 text-xs mt-1">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-red-400" />
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
  nodes,
  edges,
  onNodeClick,
  darkMode = true,
  height = '600px',
}: ArchitectureDiagramProps) {
  return (
    <div className="architecture-diagram">
      <ReactFlowDiagram
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        darkMode={darkMode}
        nodeTypes={nodeTypes}
        height={height}
        fitView
      />
    </div>
  );
}

export default ArchitectureDiagram;
