# Multi-Agent Coordination Guide

## Overview
This project uses multiple AI agents to implement features in parallel. This document defines coordination patterns to ensure smooth collaboration.

## Agent Responsibilities

### Agent A - Backend Core
**Focus:** Data structures, API routes, external integrations
**Key Files:**
- `app/lib/types.ts`
- `app/lib/blaxel.ts`
- `app/api/jobs/route.ts`
- `app/api/jobs/[id]/route.ts`
- `app/api/jobs/[id]/explore/route.ts` (new)
- `app/api/jobs/[id]/sandbox/route.ts` (new)
- `app/lib/prompts/sonnet-synthesis.md`

**Deliverables:**
1. Types updated with new fields
2. Sandbox can be paused/resumed/deleted
3. AnalysisContext stored in jobs
4. `/explore` endpoint working
5. `/sandbox` DELETE endpoint working

### Agent B - React Flow Components
**Focus:** Interactive diagram visualization
**Key Files:**
- `app/components/ReactFlowDiagram.tsx` (new)
- `app/components/ArchitectureDiagram.tsx` (new)
- `app/components/DataFlowDiagram.tsx` (new)

**Deliverables:**
1. React Flow installed and configured
2. Base diagram component with dark theme
3. Architecture diagram with high-level nodes
4. Click/hover interactions for node details
5. Mermaid fallback support

### Agent C - UI Integration
**Focus:** Context viewing, exploration UI, main page
**Key Files:**
- `app/components/AnalysisContextViewer.tsx` (new)
- `app/components/SandboxExplorer.tsx` (new)
- `app/page.tsx`

**Deliverables:**
1. AnalysisContext viewer with collapsible sections
2. Truncated summaries with expand option
3. Sandbox explorer with chat/browser toggle
4. New tabs in main page
5. Manual sandbox delete button
6. Graceful handling of old jobs

## Coordination Rules

### 1. Interface Contracts

**Agent A → Agent B/C Interface:**
```typescript
// Types Agent A will provide:
interface AnalysisJob {
  // ... existing fields ...
  analysisContext?: AnalysisContext;
  sandboxPaused?: boolean;
  reactFlowData?: {
    architecture: { nodes: Node[], edges: Edge[] };
    dataFlow: { nodes: Node[], edges: Edge[] };
  };
}

interface AnalysisContext {
  repositoryUrl: string;
  collectedAt: string;
  structure: {
    rootFiles: string[];
    directories: string[];
    entryPoints: string[];
  };
  configFiles: Record<string, { content: string; keyDeps?: string[] }>;
  sourceFiles: Array<{
    path: string;
    summary: string;
    imports?: string[];
    exports?: string[];
  }>;
  patterns: {
    framework: string;
    architecture: string;
    keyModules: string[];
  };
  metadata?: {
    linesOfCode?: number;
    fileCount?: number;
    testFiles?: string[];
  };
}

// API endpoints Agent A will provide:
GET /api/jobs/[id]  // Returns job with analysisContext
POST /api/jobs/[id]/explore  // { action: 'read'|'glob'|'grep', params: {...} }
DELETE /api/jobs/[id]/sandbox  // Deletes paused sandbox
```

**Agent B Interface:**
```typescript
// Components Agent B will provide:
<ReactFlowDiagram 
  nodes={Node[]}
  edges={Edge[]}
  onNodeClick={(node) => void}
  darkMode={boolean}
/>

<ArchitectureDiagram 
  data={reactFlowData.architecture}
  onNodeDetails={(nodeId) => NodeDetails}
/>
```

**Agent C Interface:**
```typescript
// Components Agent C will provide:
<AnalysisContextViewer 
  context={AnalysisContext}
  maxSummaryLength={number}
/>

<SandboxExplorer 
  jobId={string}
  sandboxPaused={boolean}
  onDeleteSandbox={() => void}
/>
```

### 2. Dependencies

**Order of Operations:**
1. Agent A starts first (creates types and interfaces)
2. Agent B and C can start in parallel once Agent A completes types
3. All agents finish independently
4. Final integration by any agent (or human)

### 3. Shared Resources

**No shared file editing allowed** - each agent owns specific files:
- Agent A: Backend files only
- Agent B: Component files in `app/components/*Diagram*`
- Agent C: Component files in `app/components/*Viewer*`, `app/components/*Explorer*`, `app/page.tsx`

### 4. Communication Protocol

**Status Updates:**
- Each agent updates their TODO list as they complete tasks
- Mark tasks as `in_progress` when starting, `completed` when done
- Use comments in code for any assumptions or questions

**Conflict Resolution:**
- If two agents need to modify the same file, split the work differently
- Default: Agent with primary responsibility owns the file
- Questions go to human for resolution

### 5. Code Standards

**TypeScript:**
- Strict mode enabled
- All functions must have return types
- No `any` types unless absolutely necessary

**React:**
- Use functional components with hooks
- Props interfaces required for all components
- Error boundaries for diagram components

**Styling:**
- Tailwind CSS classes
- Dark mode support required
- Responsive design where applicable

### 6. Testing Strategy

**Agent A:**
- Verify API endpoints return correct data structure
- Test pause/resume/delete sandbox functions
- Ensure analysisContext is stored correctly

**Agent B:**
- Verify React Flow renders without errors
- Test node interactions (click, hover)
- Ensure dark theme applies correctly

**Agent C:**
- Test tab switching
- Verify truncation/expansion works
- Test sandbox delete button

### 7. Integration Checklist

After all agents complete:
- [ ] Types match across all files
- [ ] Components import correct types
- [ ] API endpoints return expected format
- [ ] Page.tsx integrates all components
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Dark mode works throughout
- [ ] Old jobs display gracefully

## Common Patterns

### Adding New Dependencies
Always check package.json first:
```bash
# Read current package.json
# Add to dependencies or devDependencies as appropriate
# Update all agents if shared dependency
```

### Error Handling
```typescript
// Always wrap external calls
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  console.error('Context:', error);
  // Return safe default or throw with context
  throw new Error(`Operation failed: ${error.message}`);
}
```

### Type Safety
```typescript
// Prefer strict typing over inference
const nodes: Node<CustomData>[] = [];

// Use type guards for optional fields
if (job.analysisContext) {
  // TypeScript knows analysisContext is defined here
}
```

## Questions?

If uncertain about:
- **Interface design** → Check with human
- **Implementation approach** → Follow existing patterns in codebase
- **File ownership** → Check this document's "Agent Responsibilities" section
- **Dependencies** → Read package.json and follow existing versions
