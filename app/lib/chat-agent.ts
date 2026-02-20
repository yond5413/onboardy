import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SandboxInstance } from '@blaxel/core';

const HAIKU_MODEL = 'claude-haiku-4-5';

const CHAT_SYSTEM_PROMPT = `You are an expert software architect and developer assistant.

Your role is to help users understand and work with their codebase. You have access to the repository files in the sandbox.

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
  relatedEdges?: string[];
  neighborNodes?: string[];
  action?: 'explain' | 'trace' | 'debug' | 'files';
}

const formatGraphContext = (graphContext?: GraphContext): string => {
  if (!graphContext) return '';

  const lines = [
    '## Graph Context',
    `Node ID: ${graphContext.nodeId || 'unknown'}`,
    `Node Label: ${graphContext.nodeLabel || 'unknown'}`,
    `Node Type: ${graphContext.nodeType || 'unknown'}`,
    `Action: ${graphContext.action || 'general'}`,
  ];

  if (graphContext.relatedEdges?.length) {
    lines.push(`Related Edges: ${graphContext.relatedEdges.join(', ')}`);
  }

  if (graphContext.neighborNodes?.length) {
    lines.push(`Neighbor Nodes: ${graphContext.neighborNodes.join(', ')}`);
  }

  return `${lines.join('\n')}\n`;
};

const CHAT_PROMPT_TEMPLATE = (question: string, context?: string, graphContext?: GraphContext) => `
The user is asking about a repository that has been analyzed.

${context ? `## Previous Analysis Context\n${context}\n` : ''}
${formatGraphContext(graphContext)}
## User's Question
${question}

Please answer the question by exploring the repository files if needed. Use the sandbox MCP tools to read relevant files and provide specific, accurate information.`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  contextFiles?: string[];
}

export interface ChatResult {
  response: string;
  contextFiles: string[];
}

export async function chatWithAgent(
  sandbox: SandboxInstance,
  jobId: string,
  question: string,
  conversationHistory: ChatMessage[],
  context?: string,
  graphContext?: GraphContext
): Promise<ChatResult> {
  const apiKey = process.env.BL_API_KEY;
  if (!apiKey) {
    throw new Error('BL_API_KEY environment variable is required');
  }

  const mcpUrl = `${sandbox.metadata?.url}/mcp`;

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
      tools: [],
      allowedTools: [],
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

  return {
    response: finalResponse,
    contextFiles: [...new Set(contextFiles)],
  };
}
