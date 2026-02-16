'use client';

import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  Node,
  Edge,
  Connection,
  NodeTypes,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

export interface DiagramNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  details?: Record<string, string>;
  nodeType?: 'service' | 'database' | 'client' | 'external' | 'gateway';
}

export interface ReactFlowDiagramProps {
  nodes: Node<DiagramNodeData>[];
  edges: Edge[];
  onNodeClick?: (node: Node<DiagramNodeData>) => void;
  darkMode?: boolean;
  nodeTypes?: NodeTypes;
  fitView?: boolean;
  className?: string;
  height?: string;
}

const defaultNodeTypes: NodeTypes = {};

export function ReactFlowDiagram({
  nodes: initialNodes,
  edges: initialEdges,
  onNodeClick,
  darkMode = true,
  nodeTypes = defaultNodeTypes,
  fitView = true,
  className = '',
  height = '600px',
}: ReactFlowDiagramProps) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<DiagramNodeData>) => {
      if (onNodeClick) {
        onNodeClick(node);
      }
    },
    [onNodeClick]
  );

  // Dark theme styles
  const darkThemeStyles = darkMode
    ? {
        '--xy-edge-stroke': '#64748b',
        '--xy-edge-stroke-selected': '#3b82f6',
        '--xy-connectionline-stroke': '#3b82f6',
        '--xy-handle-background': '#475569',
        '--xy-handle-border-color': '#64748b',
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
    <div
      style={{
        width: '100%',
        height,
        ...darkThemeStyles,
      }}
      className={`react-flow-wrapper ${className}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView={fitView}
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.1,
          maxZoom: 1.5,
        }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-right"
        defaultEdgeOptions={{
          animated: true,
          style: { strokeWidth: 2 },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={12}
          size={1}
          color={darkMode ? '#334155' : '#e2e8f0'}
        />
        <Controls className={darkMode ? 'bg-slate-800 border-slate-600' : ''} />
        <MiniMap
          nodeColor={(node) => {
            switch (node.data?.nodeType) {
              case 'service':
                return '#3b82f6'; // blue-500
              case 'database':
                return '#10b981'; // emerald-500
              case 'client':
                return '#a855f7'; // purple-500
              case 'external':
                return '#f97316'; // orange-500
              case 'gateway':
                return '#ef4444'; // red-500
              default:
                return '#64748b'; // slate-500
            }
          }}
          maskColor={darkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.7)'}
          className="bg-slate-900/80"
        />
      </ReactFlow>
    </div>
  );
}

export default ReactFlowDiagram;
