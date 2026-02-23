import type { SandboxInstance } from '@blaxel/core';

const HAIKU_MODEL = 'claude-haiku-4-5';
const SANDBOX_ALLOWED_TOOLS = [
  'mcp__sandbox__codegenListDir',
  'mcp__sandbox__codegenGrepSearch',
  'mcp__sandbox__codegenFileSearch',
  'mcp__sandbox__codegenReadFileRange',
  'mcp__sandbox__fsReadFile',
  'mcp__sandbox__fsListDirectory',
];

const CHAT_SYSTEM_PROMPT = `You are an expert software architect and developer assistant.

Your role is to help users understand and work with their codebase. You have access to the repository files in the sandbox.

IMPORTANT: Output plain text only. Do NOT use markdown formatting (no ## headers, no \`\`\` code blocks, no * bullet points). Use simple paragraphs and numbered lists instead.

Guidelines:
- Be helpful, clear, and concise
- When asked about code, refer to specific files and line numbers
- If you need to examine a file, use the sandbox tools to read it
- Focus on answering the user's specific question
- Don't make assumptions - verify by reading code when needed
- Provide actionable advice and code examples when relevant`;

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

const formatGraphContext = (graphContext?: GraphContext): string => {
  if (!graphContext) return '';

  const lines = [
    '=== GRAPH CONTEXT ===',
    `Node ID: ${graphContext.nodeId || 'unknown'}`,
    `Node Label: ${graphContext.nodeLabel || 'unknown'}`,
    `Node Type: ${graphContext.nodeType || 'unknown'}`,
  ];

  if (graphContext.filePath) {
    lines.push(`File Path: ${graphContext.filePath}`);
  }

  if (graphContext.action) {
    lines.push(`Action: ${graphContext.action}`);
  }

  if (graphContext.relationshipDetails?.length) {
    lines.push(`Relationships: ${graphContext.relationshipDetails.join('; ')}`);
  } else if (graphContext.neighborNodes?.length) {
    lines.push(`Connected Nodes: ${graphContext.neighborNodes.join(', ')}`);
  }

  return `${lines.join('\n')}\n`;
};

const CHAT_PROMPT_TEMPLATE = (question: string, context?: string, graphContext?: GraphContext) => `
The user is asking about a repository that has been analyzed.

${context ? `=== PREVIOUS ANALYSIS CONTEXT ===\n${context}\n` : ''}
${formatGraphContext(graphContext)}
=== USER'S QUESTION ===
${question}

IMPORTANT: Respond in plain text only. Do NOT use markdown formatting. No headers, no code blocks, no bullet points. Use simple paragraphs and numbered lists like:
1. First step
2. Second step
3. Third step

When showing code, use inline formatting like: function example() { return 'hello' }`;

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

const BLAXEL_WORKSPACE = process.env.BLAXEL_WORKSPACE || process.env.BL_WORKSPACE;
const BLAXEL_AGENT_NAME = process.env.BLAXEL_AGENT_NAME || 'onboardy-analyzer';
const BLAXEL_AGENT_URL = process.env.BLAXEL_AGENT_URL || process.env.BL_AGENT_URL
  || (BLAXEL_WORKSPACE ? `https://run.blaxel.ai/${BLAXEL_WORKSPACE}/agents/${BLAXEL_AGENT_NAME}` : null);

export async function chatWithAgent(
  sandbox: SandboxInstance | null | undefined,
  jobId: string,
  question: string,
  conversationHistory: ChatMessage[],
  context?: string,
  graphContext?: GraphContext
): Promise<ChatResult> {
  const apiKey = process.env.BL_API_KEY;
  if (!apiKey) {
    throw new ChatAgentError(
      'MISSING_API_KEY',
      'BL_API_KEY environment variable is required'
    );
  }

  if (!sandbox) {
    throw new ChatAgentError(
      'SANDBOX_NOT_AVAILABLE',
      'Sandbox is not available for this job.'
    );
  }

  if (!BLAXEL_AGENT_URL) {
    throw new ChatAgentError(
      'MISSING_API_KEY',
      'BLAXEL_WORKSPACE or BL_WORKSPACE environment variable is required'
    );
  }

  const sandboxName = (sandbox as unknown as { name?: string }).name || sandbox.metadata?.name;
  console.log(`[ChatAgent] Starting chat for job ${jobId} via Blaxel agent`);

  const messages = [
    ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: question }
  ];

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const response = await fetch(`${BLAXEL_AGENT_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Blaxel-Authorization': `Bearer ${apiKey}`,
      'X-Blaxel-Workspace': BLAXEL_WORKSPACE || '',
      'X-Anthropic-Key': anthropicKey || '',
    },
    body: JSON.stringify({
      sandboxName,
      messages,
      context,
      graphContext,
      model: HAIKU_MODEL,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ChatAgentError(
      'AGENT_NO_RESPONSE',
      `Blaxel agent request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ChatAgentError(
      'AGENT_NO_RESPONSE',
      'Failed to read response stream'
    );
  }

  const decoder = new TextDecoder();
  let finalResponse = '';
  const contextFiles: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'text') {
          finalResponse += event.text;
        } else if (event.type === 'tool') {
          contextFiles.push(event.name);
        } else if (event.type === 'complete') {
          finalResponse = event.response || finalResponse;
          if (event.contextFiles) {
            contextFiles.push(...event.contextFiles);
          }
        } else if (event.type === 'error') {
          throw new ChatAgentError(
            'AGENT_NO_RESPONSE',
            `Agent error: ${event.error}`
          );
        }
      } catch {
        // Skip non-JSON lines
      }
    }
  }

  if (!finalResponse.trim()) {
    throw new ChatAgentError(
      'AGENT_NO_RESPONSE',
      'Chat agent did not return a response.',
      { contextFilesCount: contextFiles.length }
    );
  }

  return {
    response: finalResponse,
    contextFiles: [...new Set(contextFiles)],
  };
}
