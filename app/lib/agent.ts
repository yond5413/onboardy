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

const BLAXEL_WORKSPACE = process.env.BLAXEL_WORKSPACE || process.env.BL_WORKSPACE;
const BLAXEL_AGENT_NAME = process.env.BLAXEL_AGENT_NAME || 'onboardy-analyzer';
const BLAXEL_AGENT_URL = process.env.BLAXEL_AGENT_URL || process.env.BL_AGENT_URL
  || (BLAXEL_WORKSPACE ? `https://run.blaxel.ai/${BLAXEL_WORKSPACE}/agents/${BLAXEL_AGENT_NAME}` : null);

export interface OwnerInfo {
  name: string;
  email: string;
  confidence: number;
  reasons: string[];
  lastCommitDate: string;
  commitCount: number;
  recentCommitCount: number;
  filesModified?: string[];
}

export interface ComponentOwnership {
  componentId: string;
  componentLabel: string;
  owners: OwnerInfo[];
  keyFiles: string[];
}

export interface OwnershipData {
  components: {
    [componentId: string]: ComponentOwnership;
  };
  globalOwners: OwnerInfo[];
  codeownersFile?: string;
}

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

const ANALYSIS_PROMPT = `Analyze the repository at /repo and generate a system design document for multiple audiences.

## Exploration Strategy

1. **Glob patterns**: Find config files: package.json, tsconfig.json, requirements.txt, Cargo.toml, go.mod, Dockerfile, .env*
2. **Grep patterns**: Search for API routes, data models, auth patterns, external APIs
3. **Read strategically**: Entry points first, then config, then 3-5 key domain files

## Output Format

Create a LAYERED markdown document. Output ONLY markdown. IMPORTANT: Complete ALL three layers fully.

---

## LAYER 1: EXECUTIVE SUMMARY

### What This System Does
2-3 sentences: what problem it solves, primary use case.

### Key Features
- Feature 1: Brief explanation
- Feature 2: Brief explanation
- Feature 3: Brief explanation

---

## LAYER 2: DEVELOPER ONBOARDING

### Tech Stack
Bullet list of technologies (languages, frameworks, databases, key libraries with versions).

### Architecture Overview
Brief description of the architecture pattern. Include a Mermaid diagram:
\`\`\`mermaid
graph TD
    A[Client] --> B[API/Entry]
    B --> C[Core Components]
    C --> D[Database/Services]
\`\`\`

### Project Structure
Quick tour of the repository layout with main directories.

### Getting Started
#### Prerequisites
Required software, environment variables, API keys.
#### Installation
Step-by-step commands to clone, install, and run.
#### Key Files to Read First
Ordered list of 5-10 important files with brief reasons.

---

## LAYER 3: TECHNICAL DEEP DIVE

### Key Components
Use a markdown table. Include ALL significant components.

| Name | Purpose | Key Files |
|------|---------|-----------|
| ComponentName | What it does | /repo/path/to/file.ts |

### API Endpoints
For each significant route: method, path, purpose, handler file.

### Data Models
Key TypeScript interfaces or database schemas as code blocks.

### Data Flow
Numbered steps (minimum 6) showing how a typical request flows through the system. Be specific with actual function/file names.

### Environment & Configuration
Key environment variables and config files.

### Key Design Decisions
2-3 important architectural choices with rationale.

---

## Rules
- No conversational filler, no emojis
- Be specific and scannable
- Use tables and code blocks for clarity
- All file paths start with /repo/
- DO NOT clone or download anything - analyze existing /repo contents only
- Output ONLY markdown - no JSON
- ENSURE proper markdown table syntax
- Complete ALL three layers - do not truncate`;



const DIAGRAM_PROMPT = `Analyze the repository at /repo and generate comprehensive React Flow diagram data for both architecture and data flow visualization.

## Exploration Strategy

1. Identify all components by exploring:
   - Entry points (main.ts, index.ts, app.tsx, server.js)
   - Configuration (package.json, tsconfig.json)
   - Directory structure (grep -r 'export' to find modules)
   - API routes (find all /api, /routes directories)
   - Data models (find interfaces, types, schemas)
   - External services (grep 'http', 'client', 'sdk')

2. Map relationships by understanding:
   - What calls what (imports, function calls)
   - Data dependencies (what reads/writes to what)
   - External integrations (third-party APIs)
   - Authentication flows

## Output Format

Generate ONLY a JSON code block with this exact structure - no markdown text:

\`\`\`json
{
  "patterns": {
    "framework": "The main framework used (e.g., Next.js, Express, Django, Flask, etc.)",
    "architecture": "The architecture pattern (e.g., Client-Server, Microservices, Monolith, Serverless, MVC, etc.)",
    "keyModules": ["List of 5-8 key modules or directories with actual significance from the codebase"]
  },
  "reactFlowData": {
    "architecture": {
      "nodes": [
        { "id": "client-ui", "type": "client", "position": { "x": 0, "y": 100 }, "data": { "label": "Frontend UI", "description": "React/Vue/Angular components, user interface" } },
        { "id": "api-gateway", "type": "gateway", "position": { "x": 200, "y": 100 }, "data": { "label": "API Layer", "description": "Express/FastAPI/Django routes, request handling" } },
        { "id": "service-auth", "type": "service", "position": { "x": 400, "y": 50 }, "data": { "label": "Auth Service", "description": "JWT validation, user authentication" } },
        { "id": "service-core", "type": "service", "position": { "x": 400, "y": 100 }, "data": { "label": "Business Logic", "description": "Core application services" } },
        { "id": "database", "type": "database", "position": { "x": 600, "y": 100 }, "data": { "label": "Database", "description": "PostgreSQL/MongoDB/MySQL" } },
        { "id": "cache", "type": "database", "position": { "x": 600, "y": 50 }, "data": { "label": "Cache", "description": "Redis/Memcached" } },
        { "id": "external-api", "type": "external", "position": { "x": 600, "y": 150 }, "data": { "label": "External API", "description": "Third-party service integration" } }
      ],
      "edges": [
        { "id": "e1", "source": "client-ui", "target": "api-gateway", "label": "HTTP/REST" },
        { "id": "e2", "source": "api-gateway", "target": "service-auth", "label": "Validate token" },
        { "id": "e3", "source": "api-gateway", "target": "service-core", "label": "Route request" },
        { "id": "e4", "source": "service-core", "target": "database", "label": "Query/Update" },
        { "id": "e5", "source": "service-core", "target": "cache", "label": "Get/Set cache" },
        { "id": "e6", "source": "service-core", "target": "external-api", "label": "HTTP call" }
      ]
    },
    "dataFlow": {
      "nodes": [
        { "id": "user-action", "type": "input", "position": { "x": 0, "y": 100 }, "data": { "label": "User Action", "description": "User initiates request" } },
        { "id": "http-request", "type": "default", "position": { "x": 150, "y": 100 }, "data": { "label": "HTTP Request", "description": "Frontend sends request to API" } },
        { "id": "validation", "type": "default", "position": { "x": 300, "y": 100 }, "data": { "label": "Validate Request", "description": "Check auth, validate input" } },
        { "id": "process", "type": "default", "position": { "x": 450, "y": 100 }, "data": { "label": "Process", "description": "Execute business logic" } },
        { "id": "db-query", "type": "default", "position": { "x": 600, "y": 100 }, "data": { "label": "Database", "description": "Fetch/store data" } },
        { "id": "transform", "type": "default", "position": { "x": 750, "y": 100 }, "data": { "label": "Transform", "description": "Format response data" } },
        { "id": "http-response", "type": "default", "position": { "x": 900, "y": 100 }, "data": { "label": "HTTP Response", "description": "Send response to client" } },
        { "id": "render", "type": "output", "position": { "x": 1050, "y": 100 }, "data": { "label": "Render UI", "description": "Update frontend display" } }
      ],
      "edges": [
        { "id": "d1", "source": "user-action", "target": "http-request", "label": "Click/Submit", "animated": true },
        { "id": "d2", "source": "http-request", "target": "validation", "label": "POST /api/endpoint", "animated": true },
        { "id": "d3", "source": "validation", "target": "process", "label": "Request valid", "animated": true },
        { "id": "d4", "source": "process", "target": "db-query", "label": "Query needed", "animated": true },
        { "id": "d5", "source": "db-query", "target": "transform", "label": "Data rows", "animated": true },
        { "id": "d6", "source": "transform", "target": "http-response", "label": "JSON payload", "animated": true },
        { "id": "d7", "source": "http-response", "target": "render", "label": "JSON response", "animated": true }
      ]
    }
  }
}
\`\`\`

## Guidelines for Node Types
- "client": Frontend/user-facing components (React components, Vue, Angular, mobile apps)
- "service": Backend services, processors, handlers, middleware, business logic
- "database": Data stores - SQL, NoSQL, file storage, caches
- "external": Third-party APIs, payment processors, cloud services, message queues
- "gateway": API gateways, load balancers, routers, middleware layers
- "input": Data entry points in flow diagrams
- "output": Data exit points in flow diagrams

## Architecture Diagram Guidelines
- Show COMPLETE system boundaries
- Include all major components (frontend, API layer, services, databases, external integrations)
- Position left-to-right: inputs (left) → processing (center) → storage/external (right)
- Group related components vertically
- Use consistent spacing: 150-200px horizontal, 80-120px vertical
- Maximum 15 nodes (capture all significant components)
- Edge labels should describe the communication (HTTP, Query, Event, etc.)

## Data Flow Diagram Guidelines
- Show complete request lifecycle from user action to response
- Minimum 7-8 steps: User Action → Request → Validation → Processing → Data Access → Transform → Response → Render
- Each node represents a meaningful step
- All edges animated to show data movement direction
- Edge labels describe data being passed (request, validated data, query results, response, etc.)
- Maximum 10 nodes (keep flow traceable)

## Rules
- Output ONLY the JSON - no explanatory text before or after
- BE THOROUGH: Capture the actual system you find, not a generic example
- Include ALL significant components (don't leave out important pieces)
- Use realistic, specific node names based on actual code structure
- Edge labels should reflect actual communication protocols/methods in the codebase
- Descriptions should be actionable (readable by non-technical stakeholders too)
- Make sure data flow traces a real user request path
- Position nodes clearly - diagrams should tell a story at a glance`;


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
 * Call Blaxel agent via HTTP and stream results
 */
async function callBlaxelAgent(
  endpoint: string,
  body: Record<string, unknown>,
  jobId: string,
  onProgress?: (message: string) => void
): Promise<{ markdown: string; highlevel?: string; technical?: string; rawOutput: string }> {
  const apiKey = process.env.BL_API_KEY;
  if (!apiKey) {
    throw new Error('BL_API_KEY environment variable is required');
  }

  if (!BLAXEL_AGENT_URL) {
    throw new Error('BLAXEL_WORKSPACE or BL_WORKSPACE environment variable is required');
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const response = await fetch(`${BLAXEL_AGENT_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Blaxel-Authorization': `Bearer ${apiKey}`,
      'X-Blaxel-Workspace': BLAXEL_WORKSPACE || '',
      'X-Anthropic-Key': anthropicKey || '',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Blaxel agent request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Failed to read response stream');
  }

  const decoder = new TextDecoder();
  let finalResult: { markdown?: string; highlevel?: string; technical?: string; rawOutput?: string } = {};
  let rawOutput = '';
  let sseBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Accumulate chunks to handle TCP boundaries correctly
    sseBuffer += decoder.decode(value, { stream: true });

    // Split on newlines, but keep the last (possibly incomplete) part in the buffer
    const parts = sseBuffer.split('\n');
    sseBuffer = parts.pop() || '';

    for (const line of parts) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));

        if (event.type === 'text') {
          rawOutput += event.text;
          JobEvents.emitThinking(jobId, event.text);
          onProgress?.(event.text);
        } else if (event.type === 'tool') {
          JobEvents.emitToolUse(jobId, event.name);
          onProgress?.(`[Tool: ${event.name}]`);
        } else if (event.type === 'highlevel') {
          JobEvents.emitProgress(jobId, `Generated system design (${event.length} chars)`);
          onProgress?.('Generated system design document');
        } else if (event.type === 'technical') {
          JobEvents.emitProgress(jobId, `Generated technical spec (${event.length} chars)`);
          onProgress?.('Generated technical specification');
        } else if (event.type === 'complete') {
          finalResult = event;
        } else if (event.type === 'error') {
          throw new Error(`Agent error: ${event.error}`);
        }
      } catch (e) {
        // Skip non-JSON lines, but log unexpected parse failures
        if (line.startsWith('data: ') && line.length > 6) {
          console.warn('[SSE] Failed to parse event line:', line.substring(0, 100), e);
        }
      }
    }
  }

  // Process any remaining data in the buffer after stream ends
  if (sseBuffer.trim().startsWith('data: ')) {
    try {
      const event = JSON.parse(sseBuffer.trim().slice(6));
      if (event.type === 'text') {
        rawOutput += event.text;
      } else if (event.type === 'complete') {
        finalResult = event;
      }
    } catch {
      // Final buffer was incomplete, ignore
    }
  }

  return {
    markdown: finalResult.markdown || finalResult.highlevel || finalResult.technical || rawOutput,
    highlevel: finalResult.highlevel,
    technical: finalResult.technical,
    rawOutput: finalResult.rawOutput || rawOutput,
  };
}

/**
 * Analyze repository using Claude Haiku 4.5 via Blaxel agent
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
  const metrics = createMetrics(jobId);
  
  const progress = (message: string) => {
    JobEvents.emitProgress(jobId, message);
    onProgress?.(message);
  };

  progress('Starting analysis with Claude Haiku 4.5...');

  const result = await callBlaxelAgent(
    'analyze',
    {
      sandboxName: (sandbox as unknown as { name?: string }).name || sandbox.metadata?.name,
      prompt: ANALYSIS_PROMPT,
      systemPrompt: SYSTEM_PROMPT,
      model: HAIKU_MODEL,
      jobId,
    },
    jobId,
    onProgress
  );

  // Track metrics
  updatePhase1Metrics(
    metrics,
    ANALYSIS_PROMPT,
    result.rawOutput
  );
  finalizeMetrics(metrics);

  // Log cost metrics
  console.log(formatMetrics(metrics));
  console.log('Metrics JSON:', JSON.stringify(exportMetrics(metrics), null, 2));

  progress('Analysis complete!');

  return {
    markdown: result.markdown,
    metrics,
  };
}

/**
 * Generate React Flow diagram data using Claude Haiku 4.5 via Blaxel agent
 * Outputs structured JSON for architecture and data flow diagrams
 * 
 * GUARDRAIL: Repo is pre-cloned in sandbox. Agent only uses Read/Glob/Grep tools.
 */
export async function generateDiagramWithAgent(
  sandbox: SandboxInstance,
  jobId: string,
  onProgress?: (message: string) => void
): Promise<DiagramResult> {
  const metrics = createMetrics(jobId);
  
  const progress = (message: string) => {
    JobEvents.emitProgress(jobId, message);
    onProgress?.(message);
  };

  progress('Generating diagram data with Claude Haiku 4.5...');

  const result = await callBlaxelAgent(
    'diagram',
    {
      sandboxName: (sandbox as unknown as { name?: string }).name || sandbox.metadata?.name,
      prompt: DIAGRAM_PROMPT,
      systemPrompt: SYSTEM_PROMPT,
      model: HAIKU_MODEL,
      jobId,
    },
    jobId,
    onProgress
  );

  // Guard against empty output before attempting JSON parse
  if (!result.rawOutput || result.rawOutput.trim().length === 0) {
    console.error('[Diagram] Agent returned empty output - analysis may not have completed');
    throw new Error('Diagram agent returned empty output - the agent may not have produced results');
  }

  // The diagram result is different - parse it
  let diagramData: DiagramResult;
  try {
    // Try to parse as DiagramResult from the markdown response
    const jsonMatch = result.rawOutput.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      diagramData = JSON.parse(jsonMatch[1]);
    } else {
      diagramData = JSON.parse(result.rawOutput);
    }
  } catch (parseError) {
    console.error('[Diagram] Failed to parse JSON:', parseError);
    console.log('[Diagram] Raw response length:', result.rawOutput.length);
    console.log('[Diagram] Raw response preview:', result.rawOutput.substring(0, 500));
    throw new Error('Failed to generate diagram data - invalid JSON response');
  }

  // Track metrics
  updatePhase1Metrics(
    metrics,
    DIAGRAM_PROMPT,
    result.rawOutput
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
  const metrics = createMetrics(jobId);
  
  const progress = (message: string) => {
    JobEvents.emitProgress(jobId, message);
    onProgress?.(message);
  };

  progress(`Starting ${config.name} iterative analysis with Claude Haiku 4.5...`);

  const result = await callBlaxelAgent(
    'analyze',
    {
      sandboxName: (sandbox as unknown as { name?: string }).name || sandbox.metadata?.name,
      prompt: config.prompt,
      systemPrompt: SYSTEM_PROMPT,
      model: HAIKU_MODEL,
      jobId,
    },
    jobId,
    onProgress
  );

  const finalResult: AnalysisResult = {
    markdown: result.markdown,
    metrics,
  };

  if (result.highlevel) {
    finalResult.highlevel = result.highlevel;
  }
  if (result.technical) {
    finalResult.technical = result.technical;
  }

  if (!finalResult.markdown || finalResult.markdown.length < 100) {
    finalResult.markdown = result.rawOutput;
  }

  updatePhase1Metrics(
    metrics,
    config.prompt,
    result.rawOutput
  );
  finalizeMetrics(metrics);

  console.log(formatMetrics(metrics));
  console.log('Metrics JSON:', JSON.stringify(exportMetrics(metrics), null, 2));

  progress('Analysis complete!');

  return finalResult;
}

/**
 * Extract owner and repo from GitHub URL
 */
function parseGitHubUrl(githubUrl: string): { owner: string; repo: string } | null {
  const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

/**
 * Call GitHub API with authentication
 */
async function fetchGitHubApi<T>(endpoint: string): Promise<T | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  try {
    const response = await fetch(`https://api.github.com${endpoint}`, { headers });
    
    if (!response.ok) {
      console.log(`[Ownership] GitHub API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    return await response.json() as T;
  } catch (error) {
    console.log(`[Ownership] GitHub API fetch failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}

interface GitHubContributor {
  login: string;
  id: number;
  contributions: number;
  html_url: string;
  type: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  author: {
    login: string;
    html_url: string;
  } | null;
}

/**
 * Analyze repository ownership using GitHub API
 * Identifies contributors who can be asked questions about the codebase
 * 
 * @param githubUrl - GitHub repository URL
 * @param reactFlowData - Architecture diagram data for component-level ownership
 * @param onProgress - Optional progress callback
 * @returns OwnershipData with globalOwners and component-specific owners
 */
export async function analyzeOwnership(
  githubUrl: string,
  reactFlowData?: { architecture: { nodes: Array<{ id: string; data: Record<string, unknown> }> } },
  onProgress?: (message: string) => void
): Promise<OwnershipData> {
  const progress = (message: string) => {
    console.log(`[Ownership] ${message}`);
    onProgress?.(message);
  };

  progress('Analyzing repository ownership via GitHub API...');

  const parsed = parseGitHubUrl(githubUrl);
  if (!parsed) {
    progress('Failed to parse GitHub URL');
    return { components: {}, globalOwners: [] };
  }

  const { owner, repo } = parsed;
  progress(`Fetching contributors for ${owner}/${repo}...`);

  // Step 1: Get contributors via GitHub API
  const contributors = await fetchGitHubApi<GitHubContributor[]>(
    `/repos/${owner}/${repo}/contributors?per_page=100`
  );

  if (!contributors || contributors.length === 0) {
    progress('No contributors found or API rate limited');
    return { components: {}, globalOwners: [] };
  }

  progress(`Found ${contributors.length} contributors`);

  // Step 2: Get commit dates for each contributor (for recency)
  // We'll fetch recent commits and track who made them
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const twoYearsAgoStr = twoYearsAgo.toISOString().split('T')[0];

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

  // Get recent commits to calculate recency scores
  const recentCommits = await fetchGitHubApi<GitHubCommit[]>(
    `/repos/${owner}/${repo}/commits?since=${twoYearsAgoStr}&per_page=100`
  );

  // Count commits per author (last 2 years)
  const authorCommitCounts = new Map<string, number>();
  // Count commits per author (last 90 days)
  const authorRecentCounts = new Map<string, number>();
  // Track last commit date per author
  const authorLastCommit = new Map<string, string>();

  if (recentCommits) {
    for (const commit of recentCommits) {
      const authorName = commit.commit.author.name;
      const commitDate = commit.commit.author.date;
      
      authorCommitCounts.set(authorName, (authorCommitCounts.get(authorName) || 0) + 1);
      
      if (commitDate >= ninetyDaysAgoStr) {
        authorRecentCounts.set(authorName, (authorRecentCounts.get(authorName) || 0) + 1);
      }
      
      // Update last commit date if this is more recent
      const existingLast = authorLastCommit.get(authorName);
      if (!existingLast || commitDate > existingLast) {
        authorLastCommit.set(authorName, commitDate);
      }
    }
  }

  // Step 3: Build owner info from contributors + commit data
  const owners: OwnerInfo[] = [];
  
  // Find max commits for normalization
  const maxCommits = Math.max(...contributors.map(c => c.contributions));
  const maxRecentCommits = Math.max(...Array.from(authorRecentCounts.values()), 1);

  for (const contributor of contributors) {
    // Skip bots
    if (contributor.login.includes('[bot]') || contributor.type === 'Bot') {
      continue;
    }

    const name = contributor.login;
    const email = `${contributor.login}@users.noreply.github.com`;
    const commitCount = contributor.contributions;
    
    // Get commit counts from our recent commits analysis
    // Use the contributor name as primary key, also check variations
    let recentCount = 0;
    let lastDate = authorLastCommit.get(name) || new Date().toISOString();
    
    // Try to match with analyzed commits
    for (const [authorName, count] of authorRecentCounts) {
      if (authorName.toLowerCase().includes(name.toLowerCase()) || 
          name.toLowerCase().includes(authorName.toLowerCase())) {
        recentCount = Math.max(recentCount, count);
      }
    }

    // Calculate confidence score - normalized against top contributor
    // Top contributor always gets 100%, others get proportional share
    const commitShare = commitCount / maxCommits;
    const recentShare = recentCount / maxRecentCommits;
    
    // Base confidence from commit share (90%) + small recency bonus (10%)
    const confidence = Math.min(commitShare * 0.9 + Math.min(recentShare * 0.1, 0.1), 1);

    // Build reasons
    const reasons: string[] = [];
    reasons.push(`${commitCount} total contributions`);
    if (recentCount > 0) {
      reasons.push(`${recentCount} commits in last 90 days`);
    }
    if (lastDate) {
      const lastDateObj = new Date(lastDate);
      const monthsAgo = Math.floor((Date.now() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24 * 30));
      if (monthsAgo < 12) {
        reasons.push(`Active ${monthsAgo} months ago`);
      }
    }

    owners.push({
      name,
      email,
      confidence,
      reasons,
      lastCommitDate: lastDate,
      commitCount,
      recentCommitCount: recentCount,
    });
  }

  // Sort by confidence
  owners.sort((a, b) => b.confidence - a.confidence);
  const globalOwners = owners.slice(0, 10);

  // Step 4: Calculate component-specific ownership (if we have architecture data)
  const components: OwnershipData['components'] = {};
  
  if (reactFlowData?.architecture?.nodes) {
    progress('Calculating component-specific ownership...');
    
    // For component-level, we'd need additional API calls per file
    // For now, distribute global owners based on commit counts
    for (const node of reactFlowData.architecture.nodes) {
      const nodeId = node.id;
      const nodeLabel = String(node.data?.label || nodeId);
      
      // Get top contributors for this component (simplified - would need file-specific API calls)
      const componentOwners = globalOwners.slice(0, 3).map(owner => ({
        ...owner,
        confidence: owner.confidence * 0.8, // Slightly lower confidence without file-specific data
        reasons: [`Top contributor: ${owner.reasons[0]}`],
      }));

      components[nodeId] = {
        componentId: nodeId,
        componentLabel: nodeLabel,
        owners: componentOwners,
        keyFiles: [],
      };
    }
  }

  progress(`Ownership analysis complete: ${globalOwners.length} global owners, ${Object.keys(components).length} component owners`);

  return {
    components,
    globalOwners,
  };
}

export interface JobProgressStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  progressMessage?: string;
  percentComplete?: number;
  currentStage?: string;
  resultData?: {
    highlevel?: string;
    technical?: string;
    hasMarkdown?: boolean;
  };
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface JobEventData {
  id: string;
  jobId: string;
  eventType: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function startAnalysisJob(
  sandbox: SandboxInstance,
  jobId: string,
  prompt: string,
  systemPrompt: string,
  model: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.BL_API_KEY;
  
  if (!apiKey) {
    return { success: false, error: 'BL_API_KEY is required' };
  }

  if (!BLAXEL_AGENT_URL) {
    return { success: false, error: 'BLAXEL_WORKSPACE is required' };
  }

  const sandboxName = (sandbox as unknown as { name?: string }).name || sandbox.metadata?.name;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    const response = await fetch(`${BLAXEL_AGENT_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Blaxel-Authorization': `Bearer ${apiKey}`,
        'X-Blaxel-Workspace': BLAXEL_WORKSPACE || '',
        'X-Anthropic-Key': anthropicKey || '',
      },
      body: JSON.stringify({
        sandboxName,
        prompt,
        systemPrompt,
        model,
        jobId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Agent failed: ${response.status} - ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error starting job'
    };
  }
}

export async function pollJobProgress(jobId: string): Promise<JobProgressStatus | null> {
  try {
    const supabase = await getSupabaseClient();
    
    const { data, error } = await supabase
      .from('job_progress')
      .select('*')
      .eq('job_id', jobId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      status: data.status,
      progressMessage: data.progress_message,
      percentComplete: data.percent_complete,
      currentStage: data.current_stage,
      resultData: data.result_data,
      errorMessage: data.error_message,
      startedAt: data.started_at,
      completedAt: data.completed_at,
    };
  } catch (error) {
    console.error('[pollJobProgress] Error:', error);
    return null;
  }
}

export async function pollJobEvents(jobId: string, since?: string): Promise<JobEventData[]> {
  try {
    const supabase = await getSupabaseClient();
    
    let query = supabase
      .from('job_events')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (since) {
      query = query.gt('created_at', since);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    return data.map(row => ({
      id: row.id,
      jobId: row.job_id,
      eventType: row.event_type,
      message: row.message,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('[pollJobEvents] Error:', error);
    return [];
  }
}

  
