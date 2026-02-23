/**
 * Drop-in replacement for @anthropic-ai/claude-agent-sdk's `query()` function.
 *
 * Uses the standard Anthropic TypeScript SDK (pure HTTP) + a lightweight MCP
 * client. This works in Vercel serverless (no CLI subprocesses).
 *
 * The Agent SDK spawns the Claude Code CLI as a subprocess, which is
 * incompatible with serverless. This module eliminates that dependency.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface TextBlock {
  text: string;
}

export interface ToolUseBlock {
  name: string;
  id: string;
  input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ToolUseBlock;

export interface AssistantMessage {
  type: 'assistant';
  message: {
    content: ContentBlock[];
  };
}

export interface ResultMessage {
  type: 'result';
  subtype: 'success';
  result: string;
}

export type AgentMessage = AssistantMessage | ResultMessage;

interface MCPServerConfig {
  type: string;
  url: string;
  headers?: Record<string, string>;
}

export interface QueryInput {
  prompt: string;
  options: {
    model: string;
    systemPrompt?: string;
    mcpServers?: Record<string, MCPServerConfig>;
    tools?: unknown[];
    allowedTools?: string[];
    permissionMode?: string;
    allowDangerouslySkipPermissions?: boolean;
    maxTurns?: number;
  };
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

class MCPClient {
  private url: string;
  private headers: Record<string, string>;
  private sessionId?: string;
  private requestId = 0;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.url = url;
    this.headers = headers;
  }

  async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'onboardy', version: '1.0.0' },
    });

    await this.sendNotification('notifications/initialized');
  }

  async listTools(): Promise<MCPTool[]> {
    const result = await this.sendRequest('tools/list', {});
    return (result?.tools ?? []) as MCPTool[];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (result?.content && Array.isArray(result.content)) {
      return result.content
        .map((c: { type?: string; text?: string }) => c.text ?? '')
        .join('\n');
    }

    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  async close(): Promise<void> {}

  private async sendRequest(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const id = ++this.requestId;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...this.headers,
    };
    if (this.sessionId) {
      reqHeaders['mcp-session-id'] = this.sessionId;
    }

    const res = await fetch(this.url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
    });

    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    const contentType = res.headers.get('content-type') ?? '';

    if (contentType.includes('text/event-stream')) {
      return this.parseSSE(await res.text(), id);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(
        `MCP ${method} error: ${data.error.message ?? JSON.stringify(data.error)}`,
      );
    }
    return data.result ?? {};
  }

  private async sendNotification(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers,
    };
    if (this.sessionId) {
      reqHeaders['mcp-session-id'] = this.sessionId;
    }

    await fetch(this.url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        ...(params ? { params } : {}),
      }),
    }).catch(() => {});
  }

  private parseSSE(
    body: string,
    expectedId: number,
  ): Record<string, unknown> {
    const lines = body.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(line.slice(6));
        if (json.id === expectedId) {
          if (json.error) {
            throw new Error(
              `MCP error: ${json.error.message ?? JSON.stringify(json.error)}`,
            );
          }
          return json.result ?? {};
        }
        } catch {
          // skip malformed lines
        }
    }
    return {};
  }
}

export async function* query(input: QueryInput): AsyncGenerator<AgentMessage> {
  const anthropic = new Anthropic();

  const mcpClients = new Map<
    string,
    { client: MCPClient; toolMap: Map<string, string> }
  >();
  let allTools: Anthropic.Tool[] = [];

  if (input.options.mcpServers) {
    for (const [serverName, config] of Object.entries(input.options.mcpServers)) {
      try {
        const client = new MCPClient(config.url, config.headers ?? {});
        await client.initialize();

        const mcpTools = await client.listTools();

        const toolMap = new Map<string, string>();
        for (const tool of mcpTools) {
          const prefixed = `mcp__${serverName}__${tool.name}`;
          toolMap.set(prefixed, tool.name);

          allTools.push({
            name: prefixed,
            description: tool.description ?? '',
            input_schema: (tool.inputSchema ?? { type: 'object' }) as Anthropic.Tool.InputSchema,
          });
        }

        mcpClients.set(serverName, { client, toolMap });
        console.log(
          `[ClaudeClient] Connected to MCP server "${serverName}" – ${mcpTools.length} tools`,
        );
      } catch (error) {
        console.error(
          `[ClaudeClient] Failed to connect to MCP server "${serverName}":`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  if (input.options.allowedTools && input.options.allowedTools.length > 0) {
    const allowed = new Set(input.options.allowedTools);
    allTools = allTools.filter((t) => allowed.has(t.name));
  }

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: input.prompt },
  ];

  const maxTurns = input.options.maxTurns ?? 30;

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await anthropic.messages.create({
        model: input.options.model,
        messages,
        max_tokens: 16384,
        ...(input.options.systemPrompt
          ? { system: input.options.systemPrompt }
          : {}),
        ...(allTools.length > 0 ? { tools: allTools } : {}),
      });

      const contentBlocks: ContentBlock[] = response.content.map((block) => {
        if (block.type === 'text') {
          return { text: block.text } as TextBlock;
        }
        if (block.type === 'tool_use') {
          return {
            name: block.name,
            id: block.id,
            input: block.input as Record<string, unknown>,
          } as ToolUseBlock;
        }
        return { text: '' } as TextBlock;
      });

      yield {
        type: 'assistant' as const,
        message: { content: contentBlocks },
      };

      if (response.stop_reason !== 'tool_use') {
        const finalText = response.content
          .filter(
            (b): b is Anthropic.TextBlock => b.type === 'text',
          )
          .map((b: Anthropic.TextBlock) => b.text)
          .join('');

        yield {
          type: 'result' as const,
          subtype: 'success' as const,
          result: finalText,
        };
        return;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        let content = `Tool "${block.name}" not found in any MCP server`;

        for (const [, { client, toolMap }] of mcpClients) {
          const originalName = toolMap.get(block.name);
          if (originalName) {
            try {
              content = await client.callTool(
                originalName,
                block.input as Record<string, unknown>,
              );
            } catch (err) {
              content = `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
            break;
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content,
        });
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    console.warn(`[ClaudeClient] Reached max turns (${maxTurns})`);
    yield {
      type: 'result' as const,
      subtype: 'success' as const,
      result: '',
    };
  } finally {
    for (const [, { client }] of mcpClients) {
      await client.close().catch(() => {});
    }
  }
}
