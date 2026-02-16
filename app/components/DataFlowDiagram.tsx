'use client';

import { memo } from 'react';
import { NodeProps, Handle, Position, MarkerType } from '@xyflow/react';
import { ReactFlowDiagram, DiagramNodeData } from './ReactFlowDiagram';
import type { Node, Edge, NodeTypes } from '@xyflow/react';

// Data flow specific node styles
const DataServiceNode = memo(function DataServiceNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] text-center transition-all ${
        selected
          ? 'border-cyan-400 bg-cyan-900/40 shadow-cyan-500/50'
          : 'border-cyan-500 bg-cyan-900/20 hover:bg-cyan-900/30'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-cyan-400" />
      <div className="text-cyan-200 font-semibold text-sm">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-cyan-300/70 text-xs mt-1">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-cyan-400" />
    </div>
  );
});

const DataStoreNode = memo(function DataStoreNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-full border-2 shadow-lg min-w-[140px] text-center transition-all ${
        selected
          ? 'border-emerald-400 bg-emerald-900/40 shadow-emerald-500/50'
          : 'border-emerald-500 bg-emerald-900/20 hover:bg-emerald-900/30'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-emerald-400" />
      <div className="text-emerald-200 font-semibold text-sm">{nodeData.label}</div>
      <Handle type="source" position={Position.Right} className="!bg-emerald-400" />
    </div>
  );
});

const DataClientNode = memo(function DataClientNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[140px] text-center transition-all ${
        selected
          ? 'border-violet-400 bg-violet-900/40 shadow-violet-500/50'
          : 'border-violet-500 bg-violet-900/20 hover:bg-violet-900/30'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-violet-400" />
      <div className="text-violet-200 font-semibold text-sm">{nodeData.label}</div>
      <Handle type="source" position={Position.Right} className="!bg-violet-400" />
    </div>
  );
});

const DataTransformNode = memo(function DataTransformNode({ data, selected }: NodeProps) {
  const nodeData = data as DiagramNodeData;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[140px] text-center transition-all ${
        selected
          ? 'border-amber-400 bg-amber-900/40 shadow-amber-500/50'
          : 'border-amber-500 bg-amber-900/20 hover:bg-amber-900/30'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-400" />
      <div className="text-amber-200 font-semibold text-sm">{nodeData.label}</div>
      {nodeData.description && (
        <div className="text-amber-300/70 text-xs mt-1">{nodeData.description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-amber-400" />
    </div>
  );
});

// Node type mapping for data flow
const nodeTypes: NodeTypes = {
  service: DataServiceNode,
  database: DataStoreNode,
  client: DataClientNode,
  external: DataTransformNode,
  gateway: DataServiceNode,
};

export interface DataFlowDiagramProps {
  nodes: Node<DiagramNodeData>[];
  edges: Edge[];
  onNodeClick?: (node: Node<DiagramNodeData>) => void;
  darkMode?: boolean;
  height?: string;
}

// Helper function to enhance edges with data flow styling
export function enhanceDataFlowEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    animated: true,
    style: {
      strokeWidth: 2,
      stroke: '#64748b',
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 20,
      height: 20,
      color: '#64748b',
    },
  }));
}

export function DataFlowDiagram({
  nodes,
  edges,
  onNodeClick,
  darkMode = true,
  height = '600px',
}: DataFlowDiagramProps) {
  const enhancedEdges = enhanceDataFlowEdges(edges);

  return (
    <div className="data-flow-diagram">
      <ReactFlowDiagram
        nodes={nodes}
        edges={enhancedEdges}
        onNodeClick={onNodeClick}
        darkMode={darkMode}
        nodeTypes={nodeTypes}
        height={height}
        fitView
      />
    </div>
  );
}

export default DataFlowDiagram;
