/**
 * Client for calling the Blaxel analysis agent via HTTP
 * 
 * This module provides the same interface as the original agent.ts functions,
 * but calls the remote Blaxel agent instead of running the Agent SDK locally.
 */

import type { SandboxInstance } from '@blaxel/core';
import type { AnalysisMetrics } from './cost-tracker';
import { readFile } from 'fs/promises';
import path from 'path';

const AGENT_URL = process.env.BLAXEL_AGENT_URL;

if (!AGENT_URL) {
  console.warn('[AgentClient] BLAXEL_AGENT_URL not set - agent calls will fail');
}

// Load prompts (same as agent.ts)
const ANALYSIS_PROMPT = await readFile(
  path.join(process.cwd(), 'app/lib/prompts/repo-analysis.md'),
  'utf-8'
);

const DIAGRAM_PROMPT = await readFile(
  path.join(process.cwd(), 'app/lib/prompts/repo-analysis.md'),
  'utf-8'
).then(content => {
  // Extract diagram generation section or use a simplified prompt
  return `Analyze the repository at /repo and generate React Flow diagram data.

Output a JSON object with this structure:
\`\`\`json
{
  "patterns": {
    "framework": "string",
    "architecture": "string",
    "keyModules": ["string"]
  },
  "reactFlowData": {
    "architecture": {
      "nodes": [{ "id": "string", "type": "default", "position": { "x": 0, "y": 0 }, "data": { "label": "string", "description": "string" } }],
      "edges": [{ "id": "string", "source": "string", "target": "string", "label": "string" }]
    },
    "dataFlow": {
      "nodes": [],
      "edges": []
    }
  }
}
\`\`\``;
});

const SYSTEM_PROMPT = `You are an expert software architect analyzing codebases.

Guidelines:
- Be thorough but concise
- Focus on architecture, not implementation details
- Use clear, professional language
- Output structured markdown or JSON as requested`;

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

export interface AnalysisResult {
  markdown: string;
  highlevel?: string;
  technical?: string;
  metrics: AnalysisMetrics;
}

export interface DiagramResult {
  patterns: {
    framework: string;
    architecture: string;
    keyModules: string[];
  };
  reactFlowData: {
    architecture: {
      nodes: Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data: { label: string; description: string };
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        label?: string;
      }>;
    };
    dataFlow: {
      nodes: Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data: { label: string; description: string };
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        label?: string;
        animated?: boolean;
      }>;
    };
  };
  metrics: AnalysisMetrics;
}

/**
 * Analyze repository using the Blaxel agent
 */
export async function analyzeRepoWithAgent(
  sandbox: SandboxInstance,
  jobId: string,
  onProgress?: (message: string) => void
): Promise<AnalysisResult> {
  if (!AGENT_URL) {
    throw new Error('BLAXEL_AGENT_URL environment variable is required');
  }

  onProgress?.('Starting analysis with Claude Haiku 4.5...');

  const response = await fetch(`${AGENT_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId,
      sandboxName: sandbox.metadata.name,
      githubUrl: '', // Not needed by agent
      prompt: ANALYSIS_PROMPT,
      model: HAIKU_MODEL,
      systemPrompt: SYSTEM_PROMPT,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Agent analysis failed: ${error.error || response.statusText}`);
  }

  const result = await response.json();

  onProgress?.('Analysis complete!');

  // Create mock metrics (agent doesn't track these yet)
  const metrics: AnalysisMetrics = {
    jobId,
    durationMs: 0,
    retryOccurred: false,
    phase1Success: true,
    phase2Success: false,
    totalCost: 0,
    phase1: {
      model: HAIKU_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cost: 0,
    },
    phase2: null,
    fallback: null,
  };

  return {
    markdown: result.markdown,
    metrics,
  };
}

/**
 * Generate React Flow diagram data using the Blaxel agent
 */
export async function generateDiagramWithAgent(
  sandbox: SandboxInstance,
  jobId: string,
  onProgress?: (message: string) => void
): Promise<DiagramResult> {
  if (!AGENT_URL) {
    throw new Error('BLAXEL_AGENT_URL environment variable is required');
  }

  onProgress?.('Generating diagram data with Claude Haiku 4.5...');

  const response = await fetch(`${AGENT_URL}/diagram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId,
      sandboxName: sandbox.metadata.name,
      prompt: DIAGRAM_PROMPT,
      model: HAIKU_MODEL,
      systemPrompt: SYSTEM_PROMPT,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Agent diagram generation failed: ${error.error || response.statusText}`);
  }

  const result = await response.json();

  // Create mock metrics
  const metrics: AnalysisMetrics = {
    jobId,
    durationMs: 0,
    retryOccurred: false,
    phase1Success: true,
    phase2Success: false,
    totalCost: 0,
    phase1: {
      model: HAIKU_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cost: 0,
    },
    phase2: null,
    fallback: null,
  };

  return {
    ...result,
    metrics,
  };
}
