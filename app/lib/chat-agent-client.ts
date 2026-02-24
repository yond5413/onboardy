/**
 * Client for calling the Blaxel analysis agent's chat endpoint
 */

import type { SandboxInstance } from '@blaxel/core';

const AGENT_URL = process.env.BLAXEL_AGENT_URL;

const SANDBOX_ALLOWED_TOOLS = [
  'mcp__sandbox__codegenListDir',
  'mcp__sandbox__codegenGrepSearch',
  'mcp__sandbox__codegenFileSearch',
  'mcp__sandbox__codegenReadFileRange',
  'mcp__sandbox__fsReadFile',
  'mcp__sandbox__fsListDirectory',
];

export interface GraphContext {
  nodeId?: string;
  nodeLabel?: string;
  nodeType?: string;
  filePath?: string;
  relatedEdges?: string[];
  neighborNodes?: string[];
  relationshipDetails?: string[];
  action?: 'explain' | 'trace' | 'debug' | 'files';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  contextFiles?: string[];
}

export interface ChatResult {
  response: string;
  contextFiles: string[];
}

export class ChatAgentError extends Error {
  constructor(
    public code:
      | 'MISSING_API_KEY'
      | 'SANDBOX_NOT_AVAILABLE'
      | 'SANDBOX_METADATA_URL_MISSING'
      | 'AGENT_NO_RESPONSE',
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ChatAgentError';
  }
}

export async function chatWithAgent(
  sandbox: SandboxInstance | null | undefined,
  jobId: string,
  question: string,
  conversationHistory: ChatMessage[],
  context?: string,
  graphContext?: GraphContext
): Promise<ChatResult> {
  if (!AGENT_URL) {
    throw new ChatAgentError(
      'MISSING_API_KEY',
      'BLAXEL_AGENT_URL environment variable is required'
    );
  }

  if (!sandbox) {
    throw new ChatAgentError(
      'SANDBOX_NOT_AVAILABLE',
      'Sandbox is not available for this job.'
    );
  }

  if (!sandbox.metadata?.url) {
    throw new ChatAgentError(
      'SANDBOX_METADATA_URL_MISSING',
      'Sandbox metadata URL is missing. The sandbox may not be properly initialized.'
    );
  }

  const response = await fetch(`${AGENT_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId,
      sandboxName: sandbox.metadata.name,
      question,
      conversationHistory,
      allowedTools: SANDBOX_ALLOWED_TOOLS,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ChatAgentError(
      'AGENT_NO_RESPONSE',
      `Agent chat failed: ${error.error || response.statusText}`
    );
  }

  const result = await response.json();

  if (!result.response?.trim()) {
    throw new ChatAgentError(
      'AGENT_NO_RESPONSE',
      'Chat agent did not return a response.',
      { contextFilesCount: result.contextFiles?.length || 0 }
    );
  }

  return {
    response: result.response,
    contextFiles: result.contextFiles || [],
  };
}
