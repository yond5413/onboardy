import { query } from '@anthropic-ai/claude-agent-sdk';
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

  if (!sandbox.metadata?.url) {
    throw new ChatAgentError(
      'SANDBOX_METADATA_URL_MISSING',
      'Sandbox metadata URL is missing. The sandbox may not be properly initialized.'
    );
  }

  const mcpUrl = `${sandbox.metadata.url}/mcp`;
  console.log(
    `[ChatAgent] Starting chat for job ${jobId} with MCP ${mcpUrl} and ${SANDBOX_ALLOWED_TOOLS.length} allowed tools`
  );

  let finalResponse = '';
  const contextFiles: string[] = [];

  const historyPrompt = conversationHistory
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n\n');

  const fullPrompt = historyPrompt
    ? `${historyPrompt}\n\n${formatGraphContext(graphContext)}User: ${question}`
    : CHAT_PROMPT_TEMPLATE(question, context, graphContext);

  for await (const message of query({
    prompt: fullPrompt,
    options: {
      model: HAIKU_MODEL,
      systemPrompt: CHAT_SYSTEM_PROMPT,
      mcpServers: {
        sandbox: {
          type: 'http',
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      },
      allowedTools: SANDBOX_ALLOWED_TOOLS,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if ('text' in block) {
          finalResponse += block.text;
        } else if ('name' in block) {
          contextFiles.push(block.name);
        }
      }
    } else if (message.type === 'result' && message.subtype === 'success') {
      finalResponse = (message as { result?: string }).result || finalResponse;
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
