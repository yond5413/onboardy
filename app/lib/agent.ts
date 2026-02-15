import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SandboxInstance } from '@blaxel/core';
import { 
  createMetrics, 
  updatePhase1Metrics,
  finalizeMetrics,
  formatMetrics,
  exportMetrics,
  type AnalysisMetrics 
} from './cost-tracker';

const SYSTEM_PROMPT = `You are an expert software architect and technical analyst.

Your expertise includes:
- Analyzing codebases to understand architecture and design patterns
- Identifying tech stacks, frameworks, and dependencies
- Understanding data flows and component interactions
- Creating clear, comprehensive system design documentation

The repository is already available at /repo. Focus on analyzing the existing files.`;

const ANALYSIS_PROMPT = `Analyze the repository at /repo and generate a comprehensive system design document.

## Task

1. Explore the repository structure at /repo
2. Read key configuration files (package.json, tsconfig.json, requirements.txt, etc.)
3. Examine 5-8 important source files to understand implementation
4. Generate a complete system design document

## Output Format

Create a markdown document with:

### 1. Overview
- 2-3 paragraphs describing what the system does
- Primary purpose and problem it solves
- Key capabilities

### 2. Tech Stack
List all technologies with versions found in config files

### 3. Architecture
- High-level architecture pattern
- Key design principles
- System boundaries

Include Mermaid diagram:
\`\`\`mermaid
graph TD
    A[Client] --> B[API/Entry]
    B --> C[Core Components]
    C --> D[Database/Services]
\`\`\`

### 4. Components
For each major component:
- **Name**: Component name
- **Description**: What it does
- **Responsibilities**: Key duties
- **Key Files**: Main files

### 5. Data Flow
Describe how data moves through the system

Include Mermaid sequence:
\`\`\`mermaid
sequenceDiagram
    participant User
    participant API
    participant Service
    participant DB
\`\`\`

### 6. Key Design Decisions
Highlight 2-3 important architectural decisions

## Guidelines
- Be thorough but concise
- Use specific file paths (all starting with /repo/)
- Make diagrams clear and accurate
- Focus on architecture, not line-by-line code
- DO NOT attempt to clone or download anything - work only with existing /repo contents`;

const HAIKU_MODEL = 'claude-haiku-4-5';

export interface AnalysisResult {
  markdown: string;
  metrics: AnalysisMetrics;
}

/**
 * Analyze repository using Claude Haiku 4.5
 * Fast, cost-effective analysis with excellent quality
 * Cost: $1/$5 per 1M tokens (vs $3/$15 for 3.5 Sonnet)
 * 
 * GUARDRAIL: Repo is pre-cloned in sandbox. Agent only uses Read/Glob/Grep tools.
 */
export async function analyzeRepoWithAgent(
  sandbox: SandboxInstance,
  jobId: string,
  onProgress?: (message: string) => void
): Promise<AnalysisResult> {
  const apiKey = process.env.BL_API_KEY;
  if (!apiKey) {
    throw new Error('BL_API_KEY environment variable is required');
  }

  const mcpUrl = `${sandbox.metadata?.url}/mcp`;
  const metrics = createMetrics(jobId);
  
  let finalResult = '';
  let rawOutput = '';

  onProgress?.('Starting analysis with Claude Haiku 4.5...');

  for await (const message of query({
    prompt: ANALYSIS_PROMPT,
    options: {
      model: HAIKU_MODEL,
      systemPrompt: SYSTEM_PROMPT,
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
      // This prevents local filesystem access and ensures isolation
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
            onProgress(block.text.substring(0, 150));
          }
        } else if ('name' in block) {
          if (onProgress) {
            onProgress(`[Tool: ${block.name}]`);
          }
        }
      }
    } else if (message.type === 'result' && message.subtype === 'success') {
      finalResult = (message as { result?: string }).result || finalResult;
    }
  }

  // Track metrics
  updatePhase1Metrics(
    metrics,
    ANALYSIS_PROMPT,
    rawOutput
  );
  finalizeMetrics(metrics);

  // Log cost metrics
  console.log(formatMetrics(metrics));
  console.log('Metrics JSON:', JSON.stringify(exportMetrics(metrics), null, 2));

  onProgress?.('Analysis complete!');

  return {
    markdown: finalResult,
    metrics,
  };
}
