import { query } from './claude-client';
import type { SandboxInstance } from '@blaxel/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { 
  createMetrics, 
  updatePhase1Metrics, 
  updatePhase2Metrics, 
  updateFallbackMetrics,
  finalizeMetrics,
  formatMetrics,
  exportMetrics,
  type AnalysisMetrics 
} from './cost-tracker';
import { validateAnalysisContext, type AnalysisContext } from './analysis-schema';

// Load prompts
const HAIKU_PROMPT = readFileSync(
  join(process.cwd(), 'app/lib/prompts/haiku-data-collection.md'),
  'utf-8'
);

const SONNET_PROMPT = readFileSync(
  join(process.cwd(), 'app/lib/prompts/sonnet-synthesis.md'),
  'utf-8'
);

const FALLBACK_PROMPT = readFileSync(
  join(process.cwd(), 'app/lib/prompts/repo-analysis.md'),
  'utf-8'
);

// Model constants
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-5-20250514';

export interface HybridAnalysisResult {
  markdown: string;
  metrics: AnalysisMetrics;
  context?: AnalysisContext;
  fallbackUsed: boolean;
}

/**
 * Main entry point for hybrid analysis
 * Orchestrates Phase 1 (Haiku) and Phase 2 (Sonnet) with fallback logic
 * 
 * GUARDRAIL: Repo is pre-cloned in sandbox via SDK. Agent only uses Read/Glob/Grep tools.
 */
export async function analyzeRepoHybrid(
  sandbox: SandboxInstance,
  jobId: string,
  onProgress?: (message: string) => void
): Promise<HybridAnalysisResult> {
  const apiKey = process.env.BL_API_KEY;
  if (!apiKey) {
    throw new Error('BL_API_KEY environment variable is required');
  }

  const mcpUrl = `${sandbox.metadata?.url}/mcp`;
  const metrics = createMetrics(jobId);

  try {
    onProgress?.('Starting Phase 1: Data collection with Haiku...');
    
    // Phase 1: Haiku data collection
    const phase1Result = await runPhase1(
      mcpUrl,
      apiKey,
      onProgress,
      metrics
    );

    // Validate Phase 1 output
    const validation = validateAnalysisContext(phase1Result.context);
    
    if (phase1Result.success && validation.valid) {
      onProgress?.('Phase 1 complete. Starting Phase 2: Synthesis with Sonnet...');
      
      // Phase 2: Sonnet synthesis
      const markdown = await runPhase2(
        mcpUrl,
        apiKey,
        onProgress,
        metrics
      );

      finalizeMetrics(metrics);
      
      const result: HybridAnalysisResult = {
        markdown,
        metrics,
        context: phase1Result.context as AnalysisContext,
        fallbackUsed: false,
      };

      // Log metrics
      console.log(formatMetrics(metrics));
      console.log('Metrics JSON:', JSON.stringify(exportMetrics(metrics), null, 2));

      return result;
    } else {
      // Phase 1 failed or invalid output - trigger fallback
      onProgress?.(`Phase 1 issues: ${validation.errors.join(', ')}. Switching to fallback...`);
      
      const fallbackResult = await runFallback(
        mcpUrl,
        apiKey,
        onProgress,
        metrics
      );

      finalizeMetrics(metrics);
      
      const result: HybridAnalysisResult = {
        markdown: fallbackResult,
        metrics,
        fallbackUsed: true,
      };

      // Log metrics
      console.log(formatMetrics(metrics));
      console.log('Metrics JSON:', JSON.stringify(exportMetrics(metrics), null, 2));

      return result;
    }
  } catch (error) {
    // If anything goes wrong, try fallback
    onProgress?.(`Error in hybrid analysis: ${error}. Attempting fallback...`);
    
    const fallbackResult = await runFallback(
      mcpUrl,
      apiKey,
      onProgress,
      metrics
    );

    finalizeMetrics(metrics);
    
    const result: HybridAnalysisResult = {
      markdown: fallbackResult,
      metrics,
      fallbackUsed: true,
    };

    console.log(formatMetrics(metrics));
    console.log('Metrics JSON:', JSON.stringify(exportMetrics(metrics), null, 2));

    return result;
  }
}

/**
 * Phase 1: Haiku data collection
 * Uses cheap model to explore and extract structured data
 * GUARDRAIL: No Bash tool - repo is pre-cloned
 */
async function runPhase1(
  mcpUrl: string,
  apiKey: string,
  onProgress?: (message: string) => void,
  metrics?: AnalysisMetrics
): Promise<{ success: boolean; context?: unknown; rawOutput: string }> {
  let rawOutput = '';
  let finalResult = '';

  for await (const message of query({
    prompt: HAIKU_PROMPT,
    options: {
      model: HAIKU_MODEL,
      systemPrompt: 'You are an efficient code analysis assistant. Focus on extracting structured data quickly and accurately. Write results to /repo/.analysis-context.json.',
      mcpServers: {
        sandbox: {
          type: 'http',
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      },
      // GUARDRAIL: Empty tools array forces agent to use ONLY sandbox MCP tools
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
          if (onProgress) {
            onProgress(`[Haiku] ${block.text.substring(0, 100)}...`);
          }
        } else if ('name' in block) {
          if (onProgress) {
            onProgress(`[Haiku Tool: ${block.name}]`);
          }
        }
      }
    } else if (message.type === 'result' && message.subtype === 'success') {
      finalResult = (message as { result?: string }).result || finalResult;
    }
  }

  // Try to read the JSON file that Haiku should have written
  try {
    // Use the query function to read the file
    let jsonContent = '';
    for await (const message of query({
      prompt: 'Read the file /repo/.analysis-context.json and return only its contents.',
      options: {
        model: HAIKU_MODEL,
        mcpServers: {
          sandbox: {
            type: 'http',
            url: mcpUrl,
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
        },
        // GUARDRAIL: Empty tools array forces agent to use ONLY sandbox MCP tools
        tools: [],
        allowedTools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block) {
            jsonContent += block.text;
          }
        }
      } else if (message.type === 'result' && message.subtype === 'success') {
        jsonContent = (message as { result?: string }).result || jsonContent;
      }
    }

    // Parse the JSON
    const context = JSON.parse(jsonContent);
    
    // Update metrics if provided
    if (metrics) {
      updatePhase1Metrics(metrics, HAIKU_PROMPT, rawOutput + jsonContent);
    }

    return { success: true, context, rawOutput };
  } catch (error) {
    console.error('Phase 1: Failed to read or parse analysis context:', error);
    
    if (metrics) {
      updatePhase1Metrics(metrics, HAIKU_PROMPT, rawOutput);
    }
    
    return { success: false, rawOutput };
  }
}

/**
 * Phase 2: Sonnet synthesis
 * Uses expensive model to generate polished document from structured data
 */
async function runPhase2(
  mcpUrl: string,
  apiKey: string,
  onProgress?: (message: string) => void,
  metrics?: AnalysisMetrics
): Promise<string> {
  let finalResult = '';
  let rawOutput = '';

  for await (const message of query({
    prompt: SONNET_PROMPT,
    options: {
      model: SONNET_MODEL,
      systemPrompt: 'You are an expert software architect. Create comprehensive, professional system design documents.',
      mcpServers: {
        sandbox: {
          type: 'http',
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      },
      // GUARDRAIL: Empty tools array forces agent to use ONLY sandbox MCP tools
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
          finalResult += block.text;
          if (onProgress) {
            onProgress(`[Sonnet] ${block.text.substring(0, 100)}...`);
          }
        }
      }
    } else if (message.type === 'result' && message.subtype === 'success') {
      finalResult = (message as { result?: string }).result || finalResult;
    }
  }

  if (metrics) {
    updatePhase2Metrics(metrics, SONNET_PROMPT, rawOutput);
  }

  return finalResult;
}

/**
 * Fallback: Sonnet full analysis
 * When Phase 1 fails, Sonnet does complete analysis
 * GUARDRAIL: No Bash tool - repo is pre-cloned
 */
async function runFallback(
  mcpUrl: string,
  apiKey: string,
  onProgress?: (message: string) => void,
  metrics?: AnalysisMetrics
): Promise<string> {
  let finalResult = '';
  let rawOutput = '';

  onProgress?.('[Fallback] Running full analysis with Sonnet...');

  for await (const message of query({
    prompt: FALLBACK_PROMPT,
    options: {
      model: SONNET_MODEL,
      systemPrompt: 'You are an expert software architect. Analyze codebases thoroughly and produce comprehensive system design documents.',
      mcpServers: {
        sandbox: {
          type: 'http',
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      },
      // GUARDRAIL: Empty tools array forces agent to use ONLY sandbox MCP tools
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
          finalResult += block.text;
          if (onProgress) {
            onProgress(`[Fallback] ${block.text.substring(0, 100)}...`);
          }
        } else if ('name' in block) {
          if (onProgress) {
            onProgress(`[Fallback Tool: ${block.name}]`);
          }
        }
      }
    } else if (message.type === 'result' && message.subtype === 'success') {
      finalResult = (message as { result?: string }).result || finalResult;
    }
  }

  if (metrics) {
    updateFallbackMetrics(metrics, FALLBACK_PROMPT, rawOutput);
  }

  return finalResult;
}
