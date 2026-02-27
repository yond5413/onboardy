#!/usr/bin/env node
/**
 * Diagram runner script - executes inside Blaxel sandbox
 * Uses Agent SDK to generate React Flow diagram data and outputs JSON to stdout
 */

// Log to stderr so it doesn't interfere with JSON output
console.error('[Runner] Starting diagram-runner.ts');

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

async function runDiagramGeneration(config: ScriptConfig) {
  let rawOutput = '';
  let jsonStr = '';
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
          } else if ('name' in block) {
            toolsUsed.push(block.name);
          }
        }
      } else if (message.type === 'result' && message.subtype === 'success') {
        jsonStr = (message as any).result || '';
      }
    }

    // Extract JSON from response
    let diagramData;
    try {
      const jsonMatch = jsonStr.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        diagramData = JSON.parse(jsonMatch[1]);
      } else {
        diagramData = JSON.parse(jsonStr);
      }
    } catch (parseError) {
      console.log(JSON.stringify({
        success: false,
        error: `Failed to parse diagram JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      }));
      process.exit(1);
    }

    // Output result as JSON to stdout
    console.log(JSON.stringify({
      success: true,
      diagramData,
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
  const diagramPrompt = readFileSync('/app/diagram-prompt.txt', 'utf-8');
  const systemPrompt = readFileSync('/app/system-prompt.txt', 'utf-8');
  console.error('[Runner] Prompts loaded. Diagram prompt length:', diagramPrompt.length);
  console.error('[Runner] System prompt length:', systemPrompt.length);
  
  const config: ScriptConfig = {
    jobId: process.env.JOB_ID || '',
    prompt: diagramPrompt,
    model: process.env.MODEL || 'claude-haiku-4-5',
    systemPrompt: systemPrompt,
    mcpUrl: process.env.MCP_URL || 'http://localhost:3100/mcp',
    apiKey: process.env.BL_API_KEY || '',
  };

  console.error('[Runner] Config ready. Starting diagram generation...');
  runDiagramGeneration(config);
} catch (error) {
  console.log(JSON.stringify({
    success: false,
    error: `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
  }));
  process.exit(1);
}
