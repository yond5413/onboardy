'use client';

import { ArchitectureDiagram, type DiagramNodeData } from '@/app/components/ArchitectureDiagram';
import type { Node, Edge } from '@xyflow/react';

const initialNodes: Node<DiagramNodeData>[] = [
    {
        id: 'client',
        type: 'client',
        position: { x: 0, y: 100 },
        data: {
            label: 'Web Browser',
            description: 'Next.js Frontend',
            nodeType: 'client'
        },
    },
    {
        id: 'gateway',
        type: 'gateway',
        position: { x: 250, y: 100 },
        data: {
            label: 'API Gateway',
            description: 'Edge Runtime',
            nodeType: 'gateway'
        },
    },
    {
        id: 'service',
        type: 'service',
        position: { x: 500, y: 25 },
        data: {
            label: 'Analysis Engine',
            description: 'Claude 3.5 Sonnet',
            nodeType: 'service'
        },
    },
    {
        id: 'database',
        type: 'database',
        position: { x: 500, y: 175 },
        data: {
            label: 'Vector Store',
            description: 'Supabase pgvector',
            nodeType: 'database'
        },
    },
    {
        id: 'external',
        type: 'external',
        position: { x: 750, y: 100 },
        data: {
            label: 'GitHub API',
            description: 'Repository Souce',
            nodeType: 'external'
        },
    },
];

const initialEdges: Edge[] = [
    { id: 'e1-2', source: 'client', target: 'gateway', animated: true },
    { id: 'e2-3', source: 'gateway', target: 'service', animated: true },
    { id: 'e2-4', source: 'gateway', target: 'database', animated: true },
    { id: 'e3-5', source: 'service', target: 'external', animated: true },
];

export default function AboutDiagram() {
    return (
        <div className="w-full h-full min-h-[400px] bg-slate-900 rounded-lg overflow-hidden border border-slate-800 shadow-inner">
            <ArchitectureDiagram
                nodes={initialNodes}
                edges={initialEdges}
                height="100%"
                darkMode={true}
            />
        </div>
    );
}
