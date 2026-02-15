import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SandboxInstance } from '@blaxel/core';

const ANALYSIS_PROMPT = `You are a technical architect analyzing a codebase.

Task:
1. Clone the repository from the provided URL to /repo
2. Explore the structure - identify entry points, dependencies, architecture patterns
3. Read key configuration files (package.json, tsconfig.json, requirements.txt, etc.)
4. Examine 3-5 important source files to understand the implementation
5. Generate a comprehensive system design document including:
   - Overview paragraph
   - Tech stack with versions
   - Architecture diagram (using Mermaid syntax)
   - Component breakdown with responsibilities
   - Data flow description
   - Key design decisions

Return only the markdown document. Be thorough but concise.`;

export async function analyzeRepoWithAgent(
  sandbox: SandboxInstance,
  githubUrl: string,
  onProgress?: (message: string) => void
): Promise<string> {
  const apiKey = process.env.BL_API_KEY;
  if (!apiKey) {
    throw new Error('BL_API_KEY environment variable is required');
  }

  const mcpUrl = `${sandbox.metadata?.url}/mcp`;
  
  let finalResult = '';

  for await (const message of query({
    prompt: `${ANALYSIS_PROMPT}\n\nRepository URL: ${githubUrl}`,
    options: {
      systemPrompt: 'You are an expert software architect. Analyze codebases and produce clear, structured system design documents.',
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
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if ('text' in block) {
          if (onProgress) {
            onProgress(block.text);
          }
          finalResult += block.text;
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

  return finalResult;
}
