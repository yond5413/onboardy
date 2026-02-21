# AGENTS.md - Agentic Coding Guidelines

This file provides guidelines for agentic coding agents operating in the Onboardy repository.

---

## 1. Build, Lint, and Test Commands

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

### Running a Single Test

*Note: No test framework is currently configured. To add tests, consider installing vitest or jest.*

```bash
# Example (if vitest is added):
npm run test -- --run single
```

---

## 2. Code Style Guidelines

### 2.1 Imports

- Use the `@/` alias for internal imports (e.g., `@/components/ui/button`)
- Use type-only imports where appropriate:
  ```typescript
  import type { GraphContext } from '@/app/lib/types';
  import { type ChatMessage, chatWithAgent } from '@/app/lib/chat-agent';
  ```
- Order imports: external packages first, then `@/` internal imports

### 2.2 React Components

- Use `'use client'` directive for interactive/client-side components
- Use function declarations, not arrow functions for exported components
- Props interfaces follow `ComponentNameProps` naming:
  ```typescript
  interface ChatPanelProps {
    jobId: string;
    isCompleted: boolean;
    graphContext?: GraphContext;
  }
  ```
- Use shadcn/ui components from `@/components/ui/`:
  ```typescript
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader } from '@/components/ui/card';
  ```

### 2.3 TypeScript

- Explicit return types for exported functions:
  ```typescript
  export async function createAnalysisSandbox(sandboxName: string): Promise<SandboxInstance> { ... }
  ```
- Use interfaces for object shapes, types for unions and primitives
- Enable strict null checks

### 2.4 Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ChatPanel`, `ArchitectureDiagram` |
| Types/Interfaces | PascalCase | `GraphContext`, `AnalysisJob` |
| Functions | camelCase | `resumeSandbox`, `cloneRepoToSandbox` |
| Variables | camelCase | `sandboxName`, `jobId` |
| Constants | UPPER_SNAKE_CASE | `IDLE_TIMEOUT_MS`, `MAX_RETRIES` |

### 2.5 Error Handling

- Use try/catch blocks with contextual error messages:
  ```typescript
  try {
    const sandbox = await SandboxInstance.get(sandboxName);
  } catch (error) {
    console.error(`[Sandbox] Failed to resume sandbox ${sandboxName}:`, error);
    throw new Error(`Failed to resume sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  ```
- Return appropriate HTTP status codes with NextResponse:
  ```typescript
  return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  ```
- Use custom error types for specific error scenarios when needed

### 2.6 Comments

- Use JSDoc for public/exported functions:
  ```typescript
  /**
   * Resume a sandbox by name
   * Blaxel sandboxes automatically resume from standby when accessed
   */
  export async function resumeSandbox(sandboxName: string): Promise<SandboxInstance> { ... }
  ```
- Use inline comments for complex logic
- Avoid obvious comments; let code be self-documenting

---

## 3. Project-Specific Guidelines

### 3.1 Blaxel Sandbox Integration

Onboardy uses Blaxel for sandboxed code execution. Key patterns:

**Creating a sandbox:**
```typescript
import { createAnalysisSandbox } from '@/app/lib/blaxel';

const sandbox = await createAnalysisSandbox(sandboxName);
```

**Resuming a sandbox:**
```typescript
import { resumeSandbox } from '@/app/lib/blaxel';

const sandbox = await resumeSandbox(sandboxName);
```

**Clone-on-first-access (important):**
When accessing a sandbox after standby, the repo may not persist. Always check and clone if needed:
```typescript
const repoCheck = await sandbox.process.exec({ command: 'ls -la /repo', timeout: 10000 });
const isEmpty = !repoCheck.stdout || repoCheck.stdout.includes('total 0');

if (isEmpty && githubUrl) {
  await cloneRepoToSandbox(sandbox, githubUrl);
}
```

**Pausing a sandbox:**
```typescript
await pauseSandbox(sandbox, sandboxName);
```

### 3.2 shadcn/ui Components

The project uses shadcn/ui component library. Reference existing components in `@/components/ui/`:

- Button, Card, Input, Dialog, DropdownMenu, etc.
- Add new components via: `npx shadcn@latest add [component]`

### 3.3 Git Worktrees for Parallelization

When leveraging sub-agents for parallel work, use Git worktrees:

```bash
# Create worktree for agent
git worktree add worktrees/agent-{id}

# Remove when done
git worktree remove worktrees/agent-{id}
```

- Worktree directory: `worktrees/agent-{id}/`
- Each worktree is an isolated git repo for parallel agent execution
- Main worktree remains clean for the primary agent

### 3.4 Product Direction

For product context and feature priorities, reference `roadmap.md`:

- Horizon 1: Graph-aware chat, ownership recommendations, sharing
- Horizon 2: Team collaboration, scheduled re-analysis
- Horizon 3: Enterprise features, cross-repo knowledge

---

## 4. Directory Structure

```
onboardy/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   └── jobs/[id]/        # Job-related endpoints
│   │       ├── chat/         # Chat endpoint
│   │       ├── explore/      # File exploration
│   │       └── sandbox/      # Sandbox management
│   ├── components/           # React components
│   │   └── ui/              # shadcn/ui components
│   └── lib/                  # Utilities, types, clients
│       ├── blaxel.ts         # Blaxel integration
│       ├── chat-agent.ts     # Chat agent logic
│       ├── agent.ts          # Analysis agent
│       ├── types.ts          # TypeScript types
│       └── supabase/         # Supabase client
├── supabase/
│   └── migrations/           # Database migrations
├── public/                   # Static assets
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## 5. Key Technologies

- **Framework**: Next.js 16 (App Router)
- **Runtime**: Node.js with TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Sandbox**: Blaxel for isolated code execution
- **AI**: Anthropic Claude (via Agent SDK)
- **Diagrams**: React Flow (@xyflow/react)

---

## 6. Common Patterns

### 6.1 API Routes

All API routes follow Next.js App Router conventions:
- Located in `app/api/`
- Use `NextResponse` for responses
- Auth check via Supabase client

### 6.2 State Management

- Server state: Supabase (database)
- Client state: React useState/useReducer
- Job events: Server-Sent Events (SSE) via job-events

### 6.3 Environment Variables

Required variables (see `.env.local.example`):
- `BL_API_KEY` - Blaxel API key
- `BL_REGION` - Blaxel region (default: us-pdx-1)
- `GITHUB_TOKEN` - GitHub token for private repos
- `SUPABASE_*` - Supabase credentials

---

## 7. Debugging Tips

- Check server logs for `[Chat]`, `[Sandbox]`, `[Clone]` prefixes
- Use Blaxel console for sandbox inspection
- Database queries via Supabase dashboard
- React Flow diagrams in browser DevTools

---

For questions about product direction, see `roadmap.md`.
