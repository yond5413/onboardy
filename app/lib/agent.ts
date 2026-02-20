import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SandboxInstance } from '@blaxel/core';
import { readFile } from 'fs/promises';
import path from 'path';
import { 
  createMetrics, 
  updatePhase1Metrics,
  finalizeMetrics,
  formatMetrics,
  exportMetrics,
  type AnalysisMetrics 
} from './cost-tracker';
import { JobEvents } from './job-events';

const HIGHLEVEL_PROMPT = `Analyze the repository at /repo using an iterative approach.

## Step 1: Explore & Take Notes
As you explore, write incremental notes to /repo/.analysis-notes.md. After examining each significant component, append your findings.

## Step 2: Know When to Stop
Use your reasoning to determine when you have enough information:
- You understand the entry points and main flows
- You've identified key components (5-12)
- You understand the high-level architecture

## Step 3: Write Final Document
When ready, create /repo/system-design.md - a concise high-level overview.

## Document Structure

### 1. Overview (2-3 sentences)
What does this system do? What problem does it solve?

### 2. Tech Stack
Bullet list of technologies:
- Frontend/UI
- Backend/Server
- Database/Storage
- Key libraries/services

### 3. Architecture (with Mermaid Diagram)
Brief description + high-level architecture diagram:
\`\`\`mermaid
graph TD
    A[Client] --> B[API]
    B --> C[Services]
    C --> D[Database]
\`\`\`

### 4. Key Components (Table Format)
| Name | Purpose | Key Files |
|------|---------|-----------|
| ComponentName | Brief description | /repo/path.ts |

### 5. Data Flow (3-5 steps)
How does a typical request move through the system?

### 6. Getting Started
- Prerequisites needed
- Quick start steps

## Rules
- Be concise - this is a high-level overview
- No emojis, no conversational filler
- Use markdown tables for components
- All paths start with /repo/
- Output ONLY markdown
- Maximum 10 components in table

Create /repo/system-design.md when done.`;

const TECHNICAL_PROMPT = `Analyze the repository at /repo using an iterative approach.

## Step 1: Explore & Take Notes
As you explore, write detailed notes to /repo/.analysis-notes.md. Include:
- Function signatures and parameters
- Data models and interfaces
- API endpoints and their contracts
- Configuration values

## Step 2: Know When to Stop
When you have captured:
- Core modules in detail
- All function signatures and interfaces
- All API routes and handlers
- Data models and storage

## Step 3: Write Final Document
Create /repo/technical-spec.md - a comprehensive technical document.

## Document Structure

### 1. Overview
What this system does (1 paragraph).

### 2. Tech Stack (with versions)
Languages, frameworks, databases, key dependencies.

### 3. Architecture
Description + Mermaid diagram showing data flow.

### 4. Component Details (Table)
| Name | Purpose | Key Files | Public APIs |
|------|---------|-----------|-------------|
| ComponentName | Brief | /repo/path.ts | functionName() |

### 5. API Endpoints
For each route:
- Endpoint: GET /api/users
- Purpose, Request, Response, Handler File

### 6. Data Models
TypeScript interfaces for key data structures.

### 7. Configuration
Environment variables and config files.

### 8. External Integrations
Third-party services used.

### 9. Data Flow
Detailed step-by-step with function names.

### 10. Key Design Decisions
Technical choices and rationale.

### 11. Getting Started
Clone, install, environment setup, run locally.

## Rules
- Be comprehensive - this is for developers
- Include actual code snippets, interfaces
- Use markdown tables
- All paths start with /repo/
- Output ONLY markdown

Create /repo/technical-spec.md when done.`;

const SYSTEM_PROMPT = `You are an expert software architect and technical analyst.

Your expertise includes:
- Analyzing codebases to understand architecture and design patterns
- Identifying tech stacks, frameworks, and dependencies
- Understanding data flows and component interactions
- Creating clear, comprehensive system design documentation

The repository is already available at /repo. Focus on analyzing the existing files.`;

const ANALYSIS_PROMPT = `Analyze the repository at /repo and generate a system design document for onboarding new developers.

## Task

1. Explore the repository structure at /repo
2. Read key configuration files (package.json, tsconfig.json, requirements.txt, etc.)
3. Examine important source files to understand the implementation
4. Generate a system design document suitable for a new developer joining the team

## Output Format

Create a concise markdown document focused on helping a new engineer understand the system within their first week.

Output ONLY markdown with these sections:

### 1. Overview
2-3 sentences describing what the system does and its primary purpose.

### 2. Tech Stack
Bullet list of technologies used (languages, frameworks, databases, key libraries).

### 3. Architecture
Brief description of the high-level architecture pattern.
Include a Mermaid diagram:
\`\`\`mermaid
graph TD
    A[Client] --> B[API/Entry]
    B --> C[Core Components]
    C --> D[Database/Services]
\`\`\`

### 4. Key Components
CRITICAL: MUST use proper markdown table format with pipes and dashes.

Format:
| Name | Purpose | Key Files |
|------|---------|-----------|
| ComponentName | Brief one-line description | /repo/path/to/file.ts |
| AnotherComponent | What it does | /repo/path/to/another.ts |

Requirements:
- Exactly 3 columns: Name, Purpose, Key Files
- Use proper markdown table syntax with | separators
- Include header separator line with dashes
- 8-12 components maximum
- Key Files column must contain specific paths starting with /repo/
- Each row on its own line

### 5. Data Flow
Numbered steps (1, 2, 3...) showing how a request moves through the system.
Each step should be one sentence explaining what happens.

### 6. Key Design Decisions
List exactly 3 important architectural decisions.

Format:
1. **Decision Name**: Brief explanation of why this choice was made and its impact.
2. **Decision Name**: Brief explanation...
3. **Decision Name**: Brief explanation...

### 7. Getting Started

#### Prerequisites
List any required software, versions, or accounts needed.

#### Installation
Step-by-step commands to set up the project locally.

#### Key Files to Read First
Ordered list of the most important files a new developer should read:
1. /repo/path/to/file.ts - Why it's important
2. /repo/path/to/another.ts - Why it's important
3. etc.

## Rules
- No conversational filler (no "Perfect!", "I've created", etc.)
- No emojis
- No introductory summaries before sections
- Be concise and scannable
- Use tables where appropriate (especially Key Components)
- Use specific file paths (all starting with /repo/)
- DO NOT attempt to clone or download anything - work only with existing /repo contents
- Output ONLY markdown - no JSON code blocks
- ENSURE all markdown tables use proper syntax with | separators and header rows`;


const DIAGRAM_PROMPT = `Analyze the repository at /repo and generate ONLY a JSON structure for React Flow diagrams.

## Task

1. Explore the repository structure at /repo to understand the architecture
2. Identify key components, services, databases, and external integrations
3. Understand the data flow through the system

## Output Format

Generate ONLY a JSON code block with this exact structure - no markdown text:

\`\`\`json
{
  "patterns": {
    "framework": "The main framework used (e.g., Next.js, Express, Django)",
    "architecture": "The architecture pattern (e.g., Client-Server, Microservices, Monolith, Serverless)",
    "keyModules": ["List of key modules or directories with significance"]
  },
  "reactFlowData": {
    "architecture": {
      "nodes": [
        { "id": "unique-id", "type": "service|database|client|external|gateway", "position": { "x": 0, "y": 0 }, "data": { "label": "Name", "description": "What this component does" } }
      ],
      "edges": [
        { "id": "edge-id", "source": "source-id", "target": "target-id", "label": "optional label" }
      ]
    },
    "dataFlow": {
      "nodes": [
        { "id": "flow-id", "type": "input|default|output", "position": { "x": 0, "y": 0 }, "data": { "label": "Step name", "description": "What happens here" } }
      ],
      "edges": [
        { "id": "flow-edge", "source": "from-id", "target": "to-id", "label": "data being passed", "animated": true }
      ]
    }
  }
}
\`\`\`

## Guidelines for Node Types
- "client": Frontend/user-facing components (use purple color)
- "service": Backend services, processors, handlers (use blue color)
- "database": Data stores - SQL, NoSQL, file storage (use green color)
- "external": Third-party APIs, external services (use orange color)
- "gateway": API gateways, load balancers (use red color)

## Guidelines for Aesthetics (Important for New Developers)
The diagrams should be aesthetically pleasing and easy to understand for a new developer joining the team.

### Architecture Diagram (12-15 nodes max)
- Use consistent horizontal spacing: 150-200px between nodes
- Use consistent vertical spacing: 80-120px between nodes
- Arrange nodes in left-to-right flow: inputs → processing → outputs
- Group related components vertically (e.g., all services together, all databases together)
- Position: start from left (client/frontend) → middle (services) → right (data stores/external)
- Keep the diagram compact and scannable

### Data Flow Diagram (8-10 nodes max)
- Show sequential steps from left to right
- Each node should clearly represent a step in processing
- Use animated edges to show direction of data flow

### General Guidelines
- Edge labels should be short and clear
- Use consistent naming conventions for node IDs
- Include a legend or use clear node types that explain themselves
- Make it visually balanced - not too crowded, not too sparse

## Guidelines
- Output ONLY the JSON - no explanatory text
- Include maximum 15 nodes for architecture diagram
- Include maximum 10 nodes for data flow diagram
- Position nodes logically (left to right flow)
- Use meaningful IDs that describe the component
- Edge labels should describe the relationship`;

const HAIKU_MODEL = 'claude-haiku-4-5';

export type AnalysisType = 'highlevel' | 'technical' | 'both';

export interface AnalysisResult {
  markdown: string;
  highlevel?: string;
  technical?: string;
  metrics: AnalysisMetrics;
}

export interface DiagramResult {
  patterns: {
    framework: string;
    architecture: string;
    keyModules: string[];
  };
  reactFlowData: {
    architecture: {
      nodes: Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data: { label: string; description: string };
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        label?: string;
      }>;
    };
    dataFlow: {
      nodes: Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data: { label: string; description: string };
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        label?: string;
        animated?: boolean;
      }>;
    };
  };
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

  const progress = (message: string) => {
    JobEvents.emitProgress(jobId, message);
    onProgress?.(message);
  };

  progress('Starting analysis with Claude Haiku 4.5...');

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
          if (block.text.length > 50) {
            JobEvents.emitThinking(jobId, block.text.substring(0, 150));
          }
          if (onProgress) {
            onProgress(block.text.substring(0, 150));
          }
        } else if ('name' in block) {
          JobEvents.emitToolUse(jobId, block.name);
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

  progress('Analysis complete!');
  JobEvents.emitComplete(jobId);

  return {
    markdown: finalResult,
    metrics,
  };
}

/**
 * Generate React Flow diagram data using Claude Haiku 4.5
 * Outputs structured JSON for architecture and data flow diagrams
 * 
 * GUARDRAIL: Repo is pre-cloned in sandbox. Agent only uses Read/Glob/Grep tools.
 */
export async function generateDiagramWithAgent(
  sandbox: SandboxInstance,
  jobId: string,
  onProgress?: (message: string) => void
): Promise<DiagramResult> {
  const apiKey = process.env.BL_API_KEY;
  if (!apiKey) {
    throw new Error('BL_API_KEY environment variable is required');
  }

  const mcpUrl = `${sandbox.metadata?.url}/mcp`;
  const metrics = createMetrics(jobId);
  
  let rawOutput = '';
  let jsonStr = '';

  const progress = (message: string) => {
    JobEvents.emitProgress(jobId, message);
    onProgress?.(message);
  };

  progress('Generating diagram data with Claude Haiku 4.5...');

  for await (const message of query({
    prompt: DIAGRAM_PROMPT,
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
          if (block.text.length > 50) {
            JobEvents.emitThinking(jobId, block.text.substring(0, 100));
          }
          if (onProgress) {
            onProgress(block.text.substring(0, 100));
          }
        } else if ('name' in block) {
          JobEvents.emitToolUse(jobId, block.name);
          if (onProgress) {
            onProgress(`[Tool: ${block.name}]`);
          }
        }
      }
    } else if (message.type === 'result' && message.subtype === 'success') {
      jsonStr = (message as { result?: string }).result || '';
    }
  }

  // Extract JSON from response
  let diagramData: DiagramResult;
  try {
    const jsonMatch = jsonStr.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      diagramData = JSON.parse(jsonMatch[1]);
    } else {
      // Try parsing the whole response
      diagramData = JSON.parse(jsonStr);
    }
  } catch (parseError) {
    console.error('[Diagram] Failed to parse JSON:', parseError);
    console.log('[Diagram] Raw response:', jsonStr.substring(0, 500));
    throw new Error('Failed to generate diagram data - invalid JSON response');
  }

  // Track metrics
  updatePhase1Metrics(
    metrics,
    DIAGRAM_PROMPT,
    rawOutput
  );
  finalizeMetrics(metrics);

  console.log('[Diagram] Generated diagram data successfully');

  return {
    ...diagramData,
    metrics,
  };
}

export async function analyzeRepoIterative(
  sandbox: SandboxInstance,
  jobId: string,
  type: AnalysisType = 'highlevel',
  onProgress?: (message: string) => void
): Promise<AnalysisResult> {
  const apiKey = process.env.BL_API_KEY;
  if (!apiKey) {
    throw new Error('BL_API_KEY environment variable is required');
  }

  const prompts = {
    highlevel: { prompt: HIGHLEVEL_PROMPT, outputFile: '/repo/system-design.md', name: 'High-Level' },
    technical: { prompt: TECHNICAL_PROMPT, outputFile: '/repo/technical-spec.md', name: 'Technical' },
    both: { 
      prompt: `${HIGHLEVEL_PROMPT}\n\nAfter creating /repo/system-design.md, continue to create /repo/technical-spec.md with detailed technical documentation.`,
      outputFile: '/repo/system-design.md',
      name: 'Both'
    },
  };

  const config = prompts[type];
  const mcpUrl = `${sandbox.metadata?.url}/mcp`;
  const metrics = createMetrics(jobId);
  
  let rawOutput = '';
  let finalResult = '';
  let notesContent = '';
  let highlevelContent = '';
  let technicalContent = '';

  const progress = (message: string) => {
    JobEvents.emitProgress(jobId, message);
    onProgress?.(message);
  };

  progress(`Starting ${config.name} iterative analysis with Claude Haiku 4.5...`);

  const agent = query({
    prompt: config.prompt,
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
      tools: [],
      allowedTools: [],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 50,
    },
  });

  const agentIterator = agent[Symbol.asyncIterator]();
  
  while (true) {
    const { done, value: message } = await agentIterator.next();
    if (done) break;

    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if ('text' in block) {
          rawOutput += block.text;
          finalResult += block.text;
          if (block.text.length > 50) {
            JobEvents.emitThinking(jobId, block.text.substring(0, 150));
          }
          if (onProgress) {
            onProgress(block.text.substring(0, 150));
          }
        } else if ('name' in block) {
          const toolName = block.name;
          JobEvents.emitToolUse(jobId, toolName);
          if (onProgress) {
            onProgress(`[Tool: ${toolName}]`);
          }
        }
      }
    } else if (message.type === 'result' && message.subtype === 'success') {
      const resultText = (message as { result?: string }).result;
      if (resultText) {
        finalResult = resultText;
        if (resultText.includes('/repo/system-design.md')) {
          highlevelContent = resultText;
        } else if (resultText.includes('/repo/technical-spec.md')) {
          technicalContent = resultText;
        }
      }
    } else if (message.type === 'system') {
      const sysMsg = message as { subtype?: string; output?: { path?: string; content?: string } };
      if (sysMsg.output?.path === '/repo/.analysis-notes.md') {
        notesContent = sysMsg.output.content || '';
      } else if (sysMsg.output?.path === '/repo/system-design.md') {
        highlevelContent = sysMsg.output.content || '';
      } else if (sysMsg.output?.path === '/repo/technical-spec.md') {
        technicalContent = sysMsg.output.content || '';
      }
    }
  }

  const result: AnalysisResult = {
    markdown: highlevelContent || technicalContent || finalResult,
    metrics,
  };

  if (highlevelContent) {
    result.highlevel = highlevelContent;
  }
  if (technicalContent) {
    result.technical = technicalContent;
  }

  if (!result.markdown || result.markdown.length < 100) {
    result.markdown = finalResult;
  }

  updatePhase1Metrics(
    metrics,
    config.prompt,
    rawOutput
  );
  finalizeMetrics(metrics);

  console.log(formatMetrics(metrics));
  console.log('Metrics JSON:', JSON.stringify(exportMetrics(metrics), null, 2));

  progress('Analysis complete!');
  JobEvents.emitComplete(jobId);

  return result;
}
