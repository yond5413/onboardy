'use client';

import { useRef, useEffect } from 'react';
import { MessageSquare, GitBranch, FileCode, Bug, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DiagramNodeData } from './ArchitectureDiagram';
import type { GraphContext } from '@/app/lib/types';

interface DiagramNode {
  id: string;
  data: DiagramNodeData;
}

interface DiagramEdge {
  id: string;
  source: string;
  target: string;
}

interface NodeActionsMenuProps {
  node: DiagramNode;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  position: { x: number; y: number };
  onSelectAction: (action: string, graphContext: GraphContext) => void;
  onClose: () => void;
}

const actions = [
  { 
    id: 'explain', 
    label: 'Explain this component', 
    prompt: 'Explain what this component does and its key responsibilities',
    icon: MessageSquare 
  },
  { 
    id: 'trace', 
    label: 'Trace data flow', 
    prompt: 'Show the data flow through this component',
    icon: GitBranch 
  },
  { 
    id: 'files', 
    label: 'Show related files', 
    prompt: 'What are the main files for this component?',
    icon: FileCode 
  },
  { 
    id: 'debug', 
    label: 'Debug this', 
    prompt: 'How would I debug issues in this component?',
    icon: Bug 
  },
  { 
    id: 'owners', 
    label: 'Who owns this', 
    prompt: 'Who can I ask about this component?',
    icon: Users 
  },
];

function buildGraphContext(node: DiagramNode, nodes: DiagramNode[], edges: DiagramEdge[]): GraphContext {
  const relatedEdges = edges
    .filter(e => e.source === node.id || e.target === node.id)
    .map(e => e.id);

  const neighborIds = new Set<string>();
  const relationshipDetails: string[] = [];
  
  edges.forEach(e => {
    if (e.source === node.id) {
      neighborIds.add(e.target);
      relationshipDetails.push(`${node.data.label} → ${e.target}`);
    }
    if (e.target === node.id) {
      neighborIds.add(e.source);
      relationshipDetails.push(`${e.source} → ${node.data.label}`);
    }
  });

  const neighborNodes = nodes
    .filter(n => neighborIds.has(n.id))
    .map(n => n.data.label);

  // Derive file path from node label
  // If label looks like a file (e.g., "auth.ts", "UserService.js"), use it directly
  // Otherwise, create a reasonable path guess
  const label = node.data.label;
  let filePath: string | undefined;
  
  if (label.match(/\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|h)$/)) {
    // Looks like a file - construct path in /repo
    filePath = `/repo/${label}`;
  } else if (label.length > 0) {
    // Could be a service/component name - try common patterns
    // For now, leave undefined so agent searches
    filePath = `/repo/${label}`;
  }

  return {
    nodeId: node.id,
    nodeLabel: label,
    nodeType: node.data.nodeType || 'service',
    filePath,
    relatedEdges,
    neighborNodes,
    relationshipDetails,
  };
}

export function NodeActionsMenu({ node, nodes, edges, position, onSelectAction, onClose }: NodeActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const graphContext = buildGraphContext(node, nodes, edges);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        minWidth: '200px',
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-slate-700 border-b border-slate-600">
        <span className="text-sm font-medium text-slate-100">{node.data.label}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-slate-400 hover:text-slate-100"
          onClick={onClose}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="p-1">
        {actions.map((action) => (
          <button
            key={action.id}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded transition-colors"
            onClick={() => onSelectAction(action.prompt, graphContext)}
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export { buildGraphContext };
