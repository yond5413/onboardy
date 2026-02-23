import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SandboxInstance } from "@blaxel/core";

export interface AnalyzeOptions {
  prompt: string;
  systemPrompt: string;
  model: string;
  jobId: string;
}

export interface DiagramOptions {
  prompt: string;
  systemPrompt: string;
  model: string;
  jobId: string;
}

export interface ChatOptions {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  model: string;
  context?: string;
  graphContext?: {
    nodeId?: string;
    nodeLabel?: string;
    nodeType?: string;
    filePath?: string;
    action?: string;
  };
}

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

const SANDBOX_ALLOWED_TOOLS = [
  'mcp__sandbox__codegenListDir',
  'mcp__sandbox__codegenGrepSearch',
  'mcp__sandbox__codegenFileSearch',
  'mcp__sandbox__codegenReadFileRange',
  'mcp__sandbox__fsReadFile',
  'mcp__sandbox__fsListDirectory',
];

export async function* analyzeRepo(
  sandbox: SandboxInstance,
  options: AnalyzeOptions
): AsyncGenerator<Record<string, unknown>> {
  const mcpUrl = `${sandbox.metadata?.url}/mcp`;
  const apiKey = process.env.BL_API_KEY;
  
  let notesContent = '';
  let highlevelContent = '';
  let technicalContent = '';
  let rawOutput = '';

  try {
    for await (const message of query({
      prompt: options.prompt,
      options: {
        model: options.model,
        systemPrompt: options.systemPrompt,
        mcpServers: {
          sandbox: {
            type: "http",
            url: mcpUrl,
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
        },
        tools: [],
        allowedTools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 50,
      },
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block) {
            rawOutput += block.text;
            yield { type: 'text', text: block.text.substring(0, 150) };
          } else if ('name' in block) {
            yield { type: 'tool', name: block.name };
          }
        }
      } 
      else if (message.type === 'result' && message.subtype === 'success') {
        const resultText = (message as { result?: string }).result || '';
        if (resultText.includes('/repo/system-design.md')) {
          highlevelContent = resultText;
        } else if (resultText.includes('/repo/technical-spec.md')) {
          technicalContent = resultText;
        }
        yield { type: 'result', result: resultText.substring(0, 200) };
      }
      else if (message.type === 'system') {
        const sysMsg = message as { subtype?: string; output?: { path?: string; content?: string } };
        if (sysMsg.output?.path === '/repo/.analysis-notes.md') {
          notesContent = sysMsg.output.content || '';
          yield { type: 'notes', length: notesContent.length };
        } else if (sysMsg.output?.path === '/repo/system-design.md') {
          highlevelContent = sysMsg.output.content || '';
          yield { type: 'highlevel', length: highlevelContent.length };
        } else if (sysMsg.output?.path === '/repo/technical-spec.md') {
          technicalContent = sysMsg.output.content || '';
          yield { type: 'technical', length: technicalContent.length };
        }
      }
    }

    yield {
      type: 'complete',
      markdown: highlevelContent || technicalContent || rawOutput,
      highlevel: highlevelContent,
      technical: technicalContent,
      rawOutput,
    };
  } catch (error) {
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function* generateDiagram(
  sandbox: SandboxInstance,
  options: DiagramOptions
): AsyncGenerator<Record<string, unknown>> {
  const mcpUrl = `${sandbox.metadata?.url}/mcp`;
  const apiKey = process.env.BL_API_KEY;
  
  let rawOutput = '';
  let jsonStr = '';

  try {
    for await (const message of query({
      prompt: options.prompt,
      options: {
        model: options.model,
        systemPrompt: options.systemPrompt,
        mcpServers: {
          sandbox: {
            type: "http",
            url: mcpUrl,
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
        },
        tools: [],
        allowedTools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block) {
            rawOutput += block.text;
            yield { type: 'text', text: block.text.substring(0, 100) };
          } else if ('name' in block) {
            yield { type: 'tool', name: block.name };
          }
        }
      } else if (message.type === 'result' && message.subtype === 'success') {
        jsonStr = (message as { result?: string }).result || '';
      }
    }

    let diagramData = null;
    try {
      const jsonMatch = jsonStr.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch?.[1]) {
        diagramData = JSON.parse(jsonMatch[1]);
      } else {
        diagramData = JSON.parse(jsonStr);
      }
    } catch (parseError) {
      yield {
        type: 'error',
        error: `Failed to parse diagram JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      };
      return;
    }

    yield {
      type: 'complete',
      diagramData,
      rawOutput,
    };
  } catch (error) {
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function* chatWithRepo(
  sandbox: SandboxInstance,
  options: ChatOptions
): AsyncGenerator<Record<string, unknown>> {
  const mcpUrl = `${sandbox.metadata?.url}/mcp`;
  const apiKey = process.env.BL_API_KEY;
  
  let finalResponse = '';
  const contextFiles: string[] = [];

  const formatGraphContext = (graphContext?: ChatOptions['graphContext']): string => {
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
    return `${lines.join('\n')}\n`;
  };

  const historyPrompt = options.messages
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n\n');

  const lastUserMessage = options.messages.filter(m => m.role === 'user').pop()?.content || '';
  
  const fullPrompt = historyPrompt
    ? `${historyPrompt}\n\n${formatGraphContext(options.graphContext)}`
    : `${formatGraphContext(options.graphContext)}User: ${lastUserMessage}`;

  try {
    for await (const message of query({
      prompt: fullPrompt,
      options: {
        model: options.model,
        systemPrompt: options.systemPrompt || CHAT_SYSTEM_PROMPT,
        mcpServers: {
          sandbox: {
            type: "http",
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
            yield { type: 'text', text: block.text };
          } else if ('name' in block) {
            contextFiles.push(block.name);
            yield { type: 'tool', name: block.name };
          }
        }
      } else if (message.type === 'result' && message.subtype === 'success') {
        finalResponse = (message as { result?: string }).result || finalResponse;
      }
    }

    yield {
      type: 'complete',
      response: finalResponse,
      contextFiles: [...new Set(contextFiles)],
    };
  } catch (error) {
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
