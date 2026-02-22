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

export interface OwnerInfo {
  name: string;
  email: string;
  confidence: number;
  reasons: string[];
  lastCommitDate: string;
  commitCount: number;
  recentCommitCount: number;
}

export interface ComponentOwnership {
  componentId: string;
  owners: OwnerInfo[];
}

export interface OwnershipData {
  components: {
    [componentId: string]: {
      owners: OwnerInfo[];
    };
  };
  globalOwners: OwnerInfo[];
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

const ANALYSIS_PROMPT = `Analyze the repository at /repo and generate a comprehensive system design document with depth for multiple audiences.

## Exploration Strategy (Cost-Optimized)

Use these efficient patterns to explore the codebase:
1. **Glob patterns**: Find all config files: package.json, tsconfig.json, requirements.txt, Cargo.toml, go.mod, Dockerfile, .env* files
2. **Grep patterns**: Search for key indicators:
   - API routes: \`router\`, \`route\`, \`@app.route\`, \`@post\`, \`@get\`, \`express.Router\`
   - Data models: \`interface\`, \`type\`, \`class\`, \`model\`, \`schema\`, \`type.*=\`
   - Authentication: \`auth\`, \`middleware\`, \`jwt\`, \`session\`, \`passport\`
   - Error handling: \`catch\`, \`error\`, \`exception\`, \`try\`
   - External APIs: \`http\`, \`axios\`, \`fetch\`, \`client\`, \`sdk\`
3. **Read strategically**: Entry points first (index, main, app files), then config files, then 3-5 key domain files

## Output Format

Create a LAYERED markdown document that serves multiple audiences. Output ONLY markdown with sections clearly marked for each layer.

---

## LAYER 1: EXECUTIVE SUMMARY (For non-technical stakeholders - ~2 min read)

### What This System Does
2-3 sentences explaining the core value: what problem it solves, primary use case.

### Key Features
- Feature 1: Brief explanation
- Feature 2: Brief explanation
- Feature 3: Brief explanation

---

## LAYER 2: DEVELOPER ONBOARDING (For newbie developers - ~10 min read)

### Tech Stack
Bullet list of main technologies (languages, frameworks, databases, key libraries with versions if available).

### Architecture Overview
Brief description of the high-level architecture pattern (e.g., Client-Server, Microservices, Monolith, Serverless, MVC).

Include a Mermaid diagram showing system boundaries:
\`\`\`mermaid
graph TD
    A[Client] --> B[API/Entry]
    B --> C[Core Components]
    C --> D[Database/Services]
\`\`\`

### Project Structure
Quick tour of the repository layout:
- /repo/src - What's here
- /repo/app - What's here
- /repo/api - What's here
(etc. for main directories)

### Getting Started

#### Prerequisites
- Required software/versions
- Required environment variables
- Accounts or API keys needed

#### Installation
Step-by-step commands:
\`\`\`bash
git clone ...
cd repo
npm install
npm run dev
\`\`\`

#### Key Files to Read First
Ordered list (read in this order):
1. /repo/path/to/file.ts - Why: Entry point, explains overall flow
2. /repo/path/to/config.ts - Why: Configuration and setup
3. /repo/path/to/models.ts - Why: Core data structures
4. /repo/path/to/api.ts - Why: Main API endpoints
5. /repo/path/to/service.ts - Why: Business logic
(Minimum 5, maximum 10)

---

## LAYER 3: TECHNICAL DEEP DIVE (For experienced developers - ~20 min read)

### Key Components
CRITICAL: MUST use proper markdown table format with pipes and dashes.

List ALL significant components (not limited to 8-12).

Format:
| Name | Purpose | Responsibilities | Key Files |
|------|---------|------------------|-----------|
| ComponentName | What it does | 1. Task, 2. Task, 3. Task | /repo/path/to/file.ts |
| AnotherComponent | Brief description | 1. Task, 2. Task | /repo/path/to/another.ts |

Requirements:
- Exactly 4 columns: Name, Purpose, Responsibilities, Key Files
- Use proper markdown table syntax with | separators
- Include header separator line with dashes
- Key Files column must contain specific paths starting with /repo/
- Each row on its own line
- Be complete: include all major components (services, handlers, models, utilities)

### API Endpoints (if applicable)
For each significant route/endpoint:
\`\`\`
POST /api/users
- Purpose: Create a new user
- Request: { name, email, password }
- Response: { id, name, email, createdAt }
- Handler: /repo/app/api/users/route.ts
\`\`\`

### Data Models & Schemas
TypeScript interfaces or database schemas for key data structures:
\`\`\`
User {
  id: string
  email: string
  name: string
  createdAt: Date
}
\`\`\`

### Authentication & Security
- How are users authenticated? (JWT, OAuth, Sessions, etc.)
- Where is auth enforced? (Middleware, Guards, etc.)
- Key security patterns used

### Error Handling & Logging
- How are errors handled? (Try-catch, Error boundaries, etc.)
- What's logged? Where? (Console, Files, External services?)
- Key error codes or patterns

### Environment Configuration
Key environment variables and what they control:
- DATABASE_URL: Connection to database
- API_KEY: External service authentication
- etc.

### External Integrations
Third-party services used:
- Service Name (API endpoint, what it's used for)
- Another Service (purpose, authentication method)

### Data Flow
Detailed steps (numbered 1, 2, 3...) showing how a typical request flows through the system:
1. User initiates action via UI
2. Frontend makes HTTP request to /api/endpoint
3. API handler validates request
4. Service layer processes business logic
5. Database query executed
6. Response formatted and returned
(Minimum 8 steps, be specific with actual flow)

### Key Design Decisions
Explain 2-3 important architectural choices:

1. **Decision Name**: 
   - What was decided
   - Why this choice was made
   - Trade-offs considered
   - Impact on the system

2. **Decision Name**: (same format)

3. **Decision Name**: (same format)

### Testing Strategy
- What's tested? (Unit, Integration, E2E)
- Test locations: /repo/path/to/tests
- How to run tests: \`npm run test\`

---

## Rules
- No conversational filler (no "Perfect!", "I've created", etc.)
- No emojis
- No introductory summaries before sections
- Be specific and scannable
- Use tables and code blocks for clarity
- Use specific file paths (all starting with /repo/)
- DO NOT attempt to clone or download anything - work only with existing /repo contents
- Output ONLY markdown - no JSON code blocks
- ENSURE all markdown tables use proper syntax with | separators and header rows
- Layers should be clearly visible by their markdown structure`;



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

/**
 * Analyze repository ownership using GitHub API
 * Identifies contributors who can be asked questions about the codebase
 * Scores by: commit count, recent activity, and file relevance
 * 
 * @param githubUrl - Full GitHub repository URL
 * @param jobId - Job ID for progress updates
 * @param onProgress - Optional progress callback
 * @returns OwnershipData with globalOwners sorted by confidence
 */
export async function analyzeOwnership(
  githubUrl: string,
  jobId: string,
  onProgress?: (message: string) => void
): Promise<OwnershipData> {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  
  const progress = (message: string) => {
    console.log(`[Ownership] ${message}`);
    onProgress?.(message);
  };

  progress('Analyzing repository ownership...');

  // Extract owner and repo from URL
  const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) {
    throw new Error('Invalid GitHub URL format');
  }
  
  const [_, owner, repo] = match;
  const repoName = repo.replace(/\.git$/, '');

  // Fetch contributors from GitHub API
  const contributorsUrl = `https://api.github.com/repos/${owner}/${repoName}/contributors?per_page=50`;
  
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }

  progress('Fetching contributors from GitHub...');
  
  const contributorsResponse = await fetch(contributorsUrl, { headers });
  
  if (!contributorsResponse.ok) {
    const errorText = await contributorsResponse.text();
    console.error(`[Ownership] GitHub API error: ${contributorsResponse.status} - ${errorText}`);
    // Return empty ownership data instead of failing
    return { components: {}, globalOwners: [] };
  }

  const contributors = await contributorsResponse.json();
  
  if (!Array.isArray(contributors) || contributors.length === 0) {
    progress('No contributors found for repository');
    return { components: {}, globalOwners: [] };
  }

  // Filter out bots
  const humanContributors = contributors.filter(
    (c: { login: string; type: string }) => 
      !c.login.includes('[bot]') && c.type !== 'Bot'
  );

  progress(`Found ${humanContributors.length} human contributors`);

  // Get additional details for each contributor (recent commits)
  const owners: OwnerInfo[] = [];
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  for (const contributor of humanContributors.slice(0, 15)) {
    try {
      // Get commit count for this contributor
      const commitsUrl = `https://api.github.com/repos/${owner}/${repoName}/commits?author=${contributor.login}&per_page=1`;
      const commitsResponse = await fetch(commitsUrl, { headers });
      
      let totalCommits = contributor.contributions || 0;
      let recentCommits = 0;
      let lastCommitDate = new Date().toISOString();

      if (commitsResponse.ok) {
        const linkHeader = commitsResponse.headers.get('Link');
        if (linkHeader) {
          // Parse total from Link  header:<https://api.github.com/repos/.../commits?page=2>; rel="last"
          const match = linkHeader.match(/page=(\d+)>; rel="last"/);
          if (match) {
            totalCommits = parseInt(match[1], 10);
          }
        }
        
        // Check if we can get recent commit dates
        const commitsData = await commitsResponse.json();
        if (Array.isArray(commitsData) && commitsData.length > 0) {
          lastCommitDate = commitsData[0].commit.author.date;
          
          // Count commits from last 3 months
          recentCommits = commitsData.filter((c: { commit: { author: { date: string } } }) => {
            const commitDate = new Date(c.commit.author.date);
            return commitDate >= threeMonthsAgo;
          }).length;
        }
      }

      // Build reasons array
      const reasons: string[] = [];
      if (totalCommits > 50) {
        reasons.push(`${totalCommits} total commits to the repository`);
      }
      if (recentCommits > 0) {
        reasons.push(`${recentCommits} commits in the last 3 months`);
      }
      if (contributor.contributions > 10) {
        reasons.push(`Top ${Math.round((humanContributors.indexOf(contributor) / humanContributors.length) * 100)}% contributor`);
      }

      // Calculate confidence score (0-1)
      // Factors: commit count (40%), recent activity (35%), rank (25%)
      const commitScore = Math.min(totalCommits / 100, 1) * 0.4;
      const recentScore = Math.min(recentCommits / 10, 1) * 0.35;
      const rankScore = (1 - humanContributors.indexOf(contributor) / humanContributors.length) * 0.25;
      const confidence = Math.min(commitScore + recentScore + rankScore, 1);

      // Get email if available from GitHub API
      let email = '';
      try {
        const userResponse = await fetch(`https://api.github.com/users/${contributor.login}`, { headers });
        if (userResponse.ok) {
          const userData = await userResponse.json();
          email = userData.email || '';
        }
      } catch {
        // Ignore email fetch errors
      }

      owners.push({
        name: contributor.login,
        email,
        confidence,
        reasons,
        lastCommitDate,
        commitCount: totalCommits,
        recentCommitCount: recentCommits,
      });
    } catch (error) {
      console.error(`[Ownership] Failed to get details for ${contributor.login}:`, error);
    }
  }

  // Sort by confidence score (descending)
  owners.sort((a, b) => b.confidence - a.confidence);

  // Take top 10 owners
  const topOwners = owners.slice(0, 10);

  progress(`Ownership analysis complete: ${topOwners.length} owners identified`);

  return {
    components: {},
    globalOwners: topOwners,
  };
}
