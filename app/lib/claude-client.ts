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


const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const MAX_ANTHROPIC_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;

interface RetriableError {
  status?: number;
  message?: string;
  headers?: {
    get?: (name: string) => string | null;
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(error: unknown): number | null {
  const candidate = error as RetriableError;
  const retryAfterRaw = candidate.headers?.get?.('retry-after') ?? candidate.headers?.get?.('x-should-retry-after');

  if (!retryAfterRaw) {
    return null;
  }

  const numericValue = Number(retryAfterRaw);
  if (!Number.isNaN(numericValue) && Number.isFinite(numericValue)) {
    return Math.max(0, numericValue * 1000);
  }

  const retryDateMs = Date.parse(retryAfterRaw);
  if (!Number.isNaN(retryDateMs)) {
    return Math.max(0, retryDateMs - Date.now());
  }

  return null;
}

function isRetryableAnthropicError(error: unknown): error is RetriableError {
  const candidate = error as RetriableError;
  if (typeof candidate.status === 'number' && RETRYABLE_STATUS_CODES.has(candidate.status)) {
    return true;
  }

  if (typeof candidate.message === 'string') {
    const lower = candidate.message.toLowerCase();
    return lower.includes('overloaded') || lower.includes('timeout') || lower.includes('temporarily unavailable');
  }

  return false;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface MCPContentText {
  type?: string;
  text?: string;
}

interface JSONRPCError {
  message?: string;
}

interface JSONRPCResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: JSONRPCError;
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
      const renderedContent = (result.content as MCPContentText[])
        .map((contentItem) => {
          if (typeof contentItem?.text === 'string') {
            return contentItem.text;
          }
          return JSON.stringify(contentItem);
        })
        .join('\n');

      return renderedContent;
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
    if (sid) {
      this.sessionId = sid;
    }

    if (!res.ok) {
      throw new Error(`MCP ${method} HTTP ${res.status}: ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type') ?? '';

    if (contentType.includes('text/event-stream')) {
      return this.parseSSE(await res.text(), id);
    }

    const data = (await res.json()) as JSONRPCResponse;
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
    const events = body.split('\n\n');

    for (const eventBlock of events) {
      const dataLines = eventBlock
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());

      if (dataLines.length === 0) {
        continue;
      }

      const payload = dataLines.join('\n');
      if (!payload || payload === '[DONE]') {
        continue;
      }

      try {
        const json = JSON.parse(payload) as JSONRPCResponse;
        if (json.id !== expectedId) {
          continue;
        }

        if (json.error) {
          throw new Error(
            `MCP error: ${json.error.message ?? JSON.stringify(json.error)}`,
          );
        }

        return json.result ?? {};
      } catch {
        // Skip malformed SSE event payloads.
      }
    }

    return {};
  }
}


async function createMessageWithRetry(
  anthropic: Anthropic,
  params: Anthropic.MessageCreateParams,
): Promise<Anthropic.Message> {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await anthropic.messages.create(params);
    } catch (error) {
      const shouldRetry =
        attempt <= MAX_ANTHROPIC_RETRIES && isRetryableAnthropicError(error);

      if (!shouldRetry) {
        throw error;
      }

      const retryAfterMs = parseRetryAfterMs(error);
      const exponentialBackoffMs = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
      const jitterMs = Math.floor(Math.random() * 250);
      const delayMs = Math.max(retryAfterMs ?? 0, exponentialBackoffMs + jitterMs);

      const status = (error as RetriableError).status ?? 'unknown';
      console.warn(
        `[ClaudeClient] Anthropic request failed with status ${status}. Retrying in ${delayMs}ms (attempt ${attempt}/${MAX_ANTHROPIC_RETRIES}).`,
      );

      await sleep(delayMs);
    }
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
          const prefixedToolName = `mcp__${serverName}__${tool.name}`;
          toolMap.set(prefixedToolName, tool.name);

          allTools.push({
            name: prefixedToolName,
            description: tool.description ?? '',
            input_schema: (tool.inputSchema ?? {
              type: 'object',
            }) as Anthropic.Tool.InputSchema,
          });
        }

        mcpClients.set(serverName, { client, toolMap });
        console.log(
          `[ClaudeClient] Connected to MCP server "${serverName}" - ${mcpTools.length} tools`,
        );
      } catch (error) {
        console.error(
          `[ClaudeClient] Failed to connect to MCP server "${serverName}":`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  if (Array.isArray(input.options.tools) && input.options.tools.length > 0) {
    allTools = allTools.concat(input.options.tools as Anthropic.Tool[]);
  }

  if (input.options.allowedTools && input.options.allowedTools.length > 0) {
    const allowed = new Set(input.options.allowedTools);
    allTools = allTools.filter((tool) => allowed.has(tool.name));
  }

  if (
    input.options.permissionMode &&
    input.options.permissionMode !== 'bypassPermissions' &&
    !input.options.allowDangerouslySkipPermissions
  ) {
    console.warn(
      `[ClaudeClient] permissionMode="${input.options.permissionMode}" requested; serverless client currently executes tools without interactive approval gates.`,
    );
  }

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: input.prompt },
  ];

  const maxTurns = input.options.maxTurns ?? 30;

  try {
    for (let turn = 0; turn < maxTurns; turn += 1) {
      const response = await createMessageWithRetry(anthropic, {
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
          return { text: block.text };
        }

        if (block.type === 'tool_use') {
          return {
            name: block.name,
            id: block.id,
            input: block.input as Record<string, unknown>,
          };
        }

        return { text: '' };
      });

      yield {
        type: 'assistant',
        message: { content: contentBlocks },
      };

      if (response.stop_reason !== 'tool_use') {
        const finalText = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');

        yield {
          type: 'result',
          subtype: 'success',
          result: finalText,
        };

        return;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') {
          continue;
        }

        let content = `Tool "${block.name}" not found in any MCP server`;

        for (const [, { client, toolMap }] of mcpClients) {
          const originalToolName = toolMap.get(block.name);
          if (!originalToolName) {
            continue;
          }

          try {
            content = await client.callTool(
              originalToolName,
              block.input as Record<string, unknown>,
            );
          } catch (error) {
            content = `Error: ${error instanceof Error ? error.message : String(error)}`;
          }

          break;
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content,
        });
      }

      if (toolResults.length === 0) {
        yield {
          type: 'result',
          subtype: 'success',
          result: '',
        };

        return;
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    console.warn(`[ClaudeClient] Reached max turns (${maxTurns})`);
    yield {
      type: 'result',
      subtype: 'success',
      result: '',
    };
  } finally {
    for (const [, { client }] of mcpClients) {
      await client.close().catch(() => {});
    }
  }
}
