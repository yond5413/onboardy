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

Create a markdown document with these sections ONLY (no JSON):

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
- DO NOT attempt to clone or download anything - work only with existing /repo contents
- Output ONLY markdown - no JSON code blocks`;

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
- "client": Frontend/user-facing components
- "service": Backend services, processors, handlers
- "database": Data stores (SQL, NoSQL, file storage)
- "external": Third-party APIs, external services
- "gateway": API gateways, load balancers

## Guidelines
- Output ONLY the JSON - no explanatory text
- Include 10-20 nodes for architecture diagram
- Include 8-12 nodes for data flow diagram
- Position nodes logically (left to right flow)
- Use meaningful IDs that describe the component
- Edge labels should describe the relationship`;

const HAIKU_MODEL = 'claude-haiku-4-5';

export interface AnalysisResult {
  markdown: string;
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

  onProgress?.('Generating diagram data with Claude Haiku 4.5...');

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
          if (onProgress) {
            onProgress(block.text.substring(0, 100));
          }
        } else if ('name' in block) {
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
