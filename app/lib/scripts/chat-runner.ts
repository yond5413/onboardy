#!/usr/bin/env node
/**
 * Chat runner script - executes inside Blaxel sandbox
 * Uses Agent SDK for interactive chat with repository context and outputs JSON to stdout
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

interface ScriptConfig {
  jobId: string;
  question: string;
  conversationHistory: string; // JSON string
  model: string;
  systemPrompt: string;
  mcpUrl: string;
  apiKey: string;
  allowedTools: string; // JSON string array
}

async function runChat(config: ScriptConfig) {
  let finalResponse = '';
  const contextFiles: string[] = [];

  try {
    // Parse conversation history
    const history = config.conversationHistory ? JSON.parse(config.conversationHistory) : [];
    
    // Build prompt from history
    const historyPrompt = history
      .map((msg: { role: string; content: string }) => 
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      )
      .join('\n\n');

    const fullPrompt = historyPrompt
      ? `${historyPrompt}\n\nUser: ${config.question}`
      : config.question;

    // Parse allowed tools
    const allowedTools = config.allowedTools ? JSON.parse(config.allowedTools) : [];

    for await (const message of query({
      prompt: fullPrompt,
      options: {
        model: config.model,
        systemPrompt: config.systemPrompt,
        mcpServers: {
          sandbox: {
            type: 'http',
            url: config.mcpUrl,
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
            },
          },
        },
        allowedTools,
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
        finalResponse = (message as any).result || finalResponse;
      }
    }

    // Output result as JSON to stdout
    console.log(JSON.stringify({
      success: true,
      response: finalResponse,
      contextFiles: [...new Set(contextFiles)],
    }));
  } catch (error) {
    // Output error as JSON to stdout
    console.log(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exit(1);
  }
}

// Read config from environment variables
const config: ScriptConfig = {
  jobId: process.env.JOB_ID || '',
  question: process.env.QUESTION || '',
  conversationHistory: process.env.CONVERSATION_HISTORY || '[]',
  model: process.env.MODEL || 'claude-haiku-4-5',
  systemPrompt: process.env.SYSTEM_PROMPT || '',
  mcpUrl: process.env.MCP_URL || 'http://localhost:3100/mcp',
  apiKey: process.env.BL_API_KEY || '',
  allowedTools: process.env.ALLOWED_TOOLS || '[]',
};

runChat(config);
