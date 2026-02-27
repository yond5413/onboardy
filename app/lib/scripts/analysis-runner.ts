#!/usr/bin/env node
/**
 * Analysis runner script - executes inside Blaxel sandbox
 * Uses Agent SDK to analyze /repo and outputs JSON to stdout
 */

// Log to stderr so it doesn't interfere with JSON output
console.error('[Runner] Starting analysis-runner.ts');

import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'fs';

interface ScriptConfig {
  jobId: string;
  prompt: string;
  model: string;
  systemPrompt: string;
  mcpUrl: string;
  apiKey: string;
}

async function runAnalysis(config: ScriptConfig) {
  let markdown = '';
  let rawOutput = '';
  const toolsUsed: string[] = [];

  try {
    for await (const message of query({
      prompt: config.prompt,
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
        tools: [],
        allowedTools: [],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block) {
            rawOutput += block.text;
            markdown += block.text;
          } else if ('name' in block) {
            toolsUsed.push(block.name);
          }
        }
      } else if (message.type === 'result' && message.subtype === 'success') {
        markdown = (message as any).result || markdown;
      }
    }

    // Output result as JSON to stdout
    console.log(JSON.stringify({
      success: true,
      markdown,
      rawOutput,
      toolsUsed,
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

// Read config from environment variables and files
try {
  console.error('[Runner] Reading prompt files...');
  const analysisPrompt = readFileSync('/app/analysis-prompt.txt', 'utf-8');
  const systemPrompt = readFileSync('/app/system-prompt.txt', 'utf-8');
  console.error('[Runner] Prompts loaded. Analysis prompt length:', analysisPrompt.length);
  console.error('[Runner] System prompt length:', systemPrompt.length);
  
  const config: ScriptConfig = {
    jobId: process.env.JOB_ID || '',
    prompt: analysisPrompt,
    model: process.env.MODEL || 'claude-haiku-4-5',
    systemPrompt: systemPrompt,
    mcpUrl: process.env.MCP_URL || 'http://localhost:3100/mcp',
    apiKey: process.env.BL_API_KEY || '',
  };

  console.error('[Runner] Config ready. Starting analysis...');
  await runAnalysis(config);
} catch (error) {
  console.log(JSON.stringify({
    success: false,
    error: `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
  }));
  process.exit(1);
}
