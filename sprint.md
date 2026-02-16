# Sprint: Preserve Analysis Context + React Flow Diagrams

## Sprint Goal
Transform the current "destroy on completion" architecture to preserve rich analysis data and display it with interactive React Flow diagrams, while keeping sandboxes paused for on-demand exploration.

## Sprint Duration
Estimated: 2-3 sessions

---

## Agent A: Backend Core
**Owner:** [To be assigned]
**Estimated Time:** 1 session
**Dependencies:** None (starts first)

### Tasks

#### 1. Update Types (app/lib/types.ts)
- [ ] Add `analysisContext?: AnalysisContext` to AnalysisJob interface
- [ ] Add `sandboxPaused?: boolean` to AnalysisJob interface
- [ ] Add `reactFlowData?: ReactFlowData` to AnalysisJob interface
- [ ] Create ReactFlowData type definition
- [ ] Update JobStatus union to include 'paused'

**Acceptance Criteria:**
- All new fields are optional (backward compatible)
- Types are exported and usable by other agents
- No TypeScript errors

#### 2. Extend Blaxel Functions (app/lib/blaxel.ts)
- [ ] Add `pauseSandbox(sandbox: SandboxInstance): Promise<void>`
- [ ] Add `resumeSandbox(sandboxName: string): Promise<SandboxInstance>`
- [ ] Add `deleteSandbox(sandboxName: string): Promise<void>` (for manual cleanup)

**Acceptance Criteria:**
- Functions use correct Blaxel SDK methods
- Proper error handling with descriptive messages
- Functions are exported

#### 3. Modify Job Processing (app/api/jobs/route.ts)
- [ ] Import AnalysisContext type from hybrid-analyzer
- [ ] Store `result.context` in job when updating to 'completed'
- [ ] Replace `destroySandbox()` with `pauseSandbox()` in finally block
- [ ] Update job status to 'paused' after pausing sandbox
- [ ] Set `sandboxPaused: true` in job update

**Acceptance Criteria:**
- AnalysisContext is persisted to job store
- Sandbox is paused, not destroyed
- Job status reflects paused state
- All existing error handling preserved

#### 4. Update Job Details API (app/api/jobs/[id]/route.ts)
- [ ] Return `analysisContext` field in response
- [ ] Return `sandboxPaused` field in response
- [ ] Return `reactFlowData` field in response (if available)

**Acceptance Criteria:**
- API returns all new fields
- Null/undefined handled gracefully
- Response structure documented

#### 5. Create Exploration API (app/api/jobs/[id]/explore/route.ts)
- [ ] Create new route file
- [ ] Implement POST handler
- [ ] Accept body: `{ action: 'read' | 'glob' | 'grep', params: {...} }`
- [ ] Resume sandbox using sandbox name from job
- [ ] Execute requested MCP tool action
- [ ] Pause sandbox after execution
- [ ] Return results

**Supported Actions:**
- `read`: params = `{ path: string }`
- `glob`: params = `{ pattern: string }`
- `grep`: params = `{ pattern: string, include?: string }`

**Acceptance Criteria:**
- All three actions work correctly
- Sandbox is always paused after use
- Proper error handling for invalid actions
- Returns structured response

#### 6. Create Sandbox Management API (app/api/jobs/[id]/sandbox/route.ts)
- [ ] Create new route file
- [ ] Implement DELETE handler
- [ ] Find job by ID
- [ ] Verify sandbox is paused
- [ ] Delete sandbox using sandbox name
- [ ] Update job: set `sandboxPaused: false`, status to 'completed'
- [ ] Return success/error response

**Acceptance Criteria:**
- Only deletes paused sandboxes
- Updates job status correctly
- Proper error handling

#### 7. Update Sonnet Prompt (app/lib/prompts/sonnet-synthesis.md)
- [ ] Keep existing Mermaid diagram instructions
- [ ] Add new section for React Flow JSON output
- [ ] Define node structure: `{ id, type, position, data: { label, description, ... } }`
- [ ] Define edge structure: `{ id, source, target, label }`
- [ ] Specify two diagram types: architecture and dataFlow

**Acceptance Criteria:**
- Prompt clearly instructs output format
- Both Mermaid and React Flow formats specified
- Examples provided

---

## Agent B: React Flow Components
**Owner:** [To be assigned]
**Estimated Time:** 1-1.5 sessions
**Dependencies:** Agent A completes types

### Tasks

#### 1. Install Dependencies
- [ ] Run `npm install @xyflow/react`
- [ ] Verify package.json updated correctly

**Acceptance Criteria:**
- Dependency added to package.json
- No installation errors

#### 2. Create Base Diagram Component (app/components/ReactFlowDiagram.tsx)
- [ ] Import React Flow components
- [ ] Define props interface: `nodes`, `edges`, `onNodeClick`, `darkMode`
- [ ] Configure React Flow with dark theme
- [ ] Implement zoom and pan controls
- [ ] Add fit-view button
- [ ] Handle node click events

**Props Interface:**
```typescript
interface ReactFlowDiagramProps {
  nodes: Node<DiagramNodeData>[];
  edges: Edge[];
  onNodeClick?: (node: Node<DiagramNodeData>) => void;
  darkMode?: boolean;
}

interface DiagramNodeData {
  label: string;
  description?: string;
  details?: Record<string, string>;
}
```

**Acceptance Criteria:**
- Renders without errors
- Dark theme applies correctly
- Zoom/pan works smoothly
- Node clicks trigger callback

#### 3. Create Architecture Diagram (app/components/ArchitectureDiagram.tsx)
- [ ] Import ReactFlowDiagram
- [ ] Define props: `data` (reactFlowData.architecture)
- [ ] Transform data to React Flow nodes/edges format
- [ ] Implement node styling based on type (service, database, client, etc.)
- [ ] Add hover tooltip showing description
- [ ] Add click handler to show detailed panel

**Node Types:**
- `service`: Backend services (blue)
- `database`: Data stores (green)
- `client`: Frontend/user facing (purple)
- `external`: External APIs (orange)
- `gateway`: Load balancers/gateways (red)

**Acceptance Criteria:**
- Renders high-level architecture
- Different node types have distinct colors
- Hover shows description
- Click opens detail view
- Smooth animations

#### 4. Create Data Flow Diagram (app/components/DataFlowDiagram.tsx)
- [ ] Import ReactFlowDiagram
- [ ] Define props: `data` (reactFlowData.dataFlow)
- [ ] Transform data to React Flow nodes/edges
- [ ] Use sequence-like layout for data flow
- [ ] Animate edges to show flow direction
- [ ] Add step numbers or labels

**Acceptance Criteria:**
- Shows data flow sequence
- Animated edges indicate direction
- Clear step progression
- Interactive nodes

#### 5. Add Mermaid Fallback Support
- [ ] Check if reactFlowData is available
- [ ] If not, render existing Mermaid diagram
- [ ] Create wrapper component that decides which to render

**Acceptance Criteria:**
- Graceful fallback to Mermaid
- No errors if data missing
- Clear indication of which renderer is active

#### 6. Styling and Polish
- [ ] Ensure dark mode throughout
- [ ] Add loading states
- [ ] Handle empty data gracefully
- [ ] Add error boundaries

**Acceptance Criteria:**
- Consistent with app dark theme
- No layout shifts
- Errors caught and displayed nicely

---

## Agent C: UI Integration
**Owner:** [To be assigned]
**Estimated Time:** 1-1.5 sessions
**Dependencies:** Agent A (types), Agent B (components)

### Tasks

#### 1. Create AnalysisContext Viewer (app/components/AnalysisContextViewer.tsx)
- [ ] Define props: `context: AnalysisContext`, `maxSummaryLength: number` (default 150)
- [ ] Create collapsible sections:
  - Repository Structure (rootFiles, directories, entryPoints)
  - Config Files (with content preview)
  - Source Files (path + truncated summary)
  - Patterns (framework, architecture, keyModules)
  - Metadata (linesOfCode, fileCount, testFiles)
- [ ] Implement truncation with "...more" expand button
- [ ] Add search/filter functionality
- [ ] Style with Tailwind dark mode

**Acceptance Criteria:**
- All sections collapsible
- Summaries truncated to maxSummaryLength
- Expand/collapse works smoothly
- Search filters across all content
- No console errors

#### 2. Create SandboxExplorer Component (app/components/SandboxExplorer.tsx)
- [ ] Define props: `jobId: string`, `sandboxPaused: boolean`, `onDeleteSandbox: () => void`
- [ ] Create toggle between "Chat" and "File Browser" modes
- [ ] **Chat Mode:**
  - Text input for natural language queries
  - Display response from /explore API
  - History of queries/responses
- [ ] **File Browser Mode:**
  - Tree view of repository structure
  - Click file to view contents via /explore
  - Breadcrumb navigation
- [ ] Add "Delete Sandbox" button (visible when sandboxPaused)
- [ ] Show sandbox status indicator

**Acceptance Criteria:**
- Toggle between modes works
- Chat interface functional
- File browser shows tree structure
- Delete button calls onDeleteSandbox
- Status indicator shows current state

#### 3. Update Main Page (app/page.tsx)
- [ ] Install Agent B's React Flow components
- [ ] Install Agent C's viewer components
- [ ] Update tab navigation:
  - "System Design" (markdown view)
  - "Architecture" (React Flow diagram)
  - "Analysis Details" (AnalysisContext viewer)
  - "Explore" (SandboxExplorer)
- [ ] Fetch and display analysisContext
- [ ] Fetch and display reactFlowData
- [ ] Add manual sandbox delete functionality
- [ ] Handle old jobs gracefully (show "Analysis details unavailable")

**Acceptance Criteria:**
- All four tabs present and functional
- Tab switching is smooth
- Components receive correct props
- Old jobs show appropriate message
- Delete sandbox button works
- No memory leaks on unmount

#### 4. Add Error Handling and Edge Cases
- [ ] Handle missing analysisContext
- [ ] Handle missing reactFlowData
- [ ] Handle failed API calls
- [ ] Handle sandbox already deleted
- [ ] Show loading states

**Acceptance Criteria:**
- Graceful degradation
- Clear error messages
- Retry options where appropriate
- No crashes

#### 5. Responsive Design
- [ ] Ensure components work on mobile
- [ ] Adjust layouts for smaller screens
- [ ] Test tab navigation on mobile

**Acceptance Criteria:**
- Mobile-friendly layouts
- Touch interactions work
- No horizontal scroll on mobile

---

## Integration Checklist

After all agents complete their work:

### Backend Integration
- [ ] Agent A types used by Agent B and C
- [ ] API endpoints return correct structure
- [ ] Pause/resume/delete functions work
- [ ] Sonnet prompt produces valid React Flow data

### Frontend Integration
- [ ] Agent B components render correctly
- [ ] Agent C components use Agent B components
- [ ] Page.tsx integrates all pieces
- [ ] Dark mode consistent across all components

### End-to-End Testing
- [ ] Submit job → Analysis completes → Context stored → Sandbox paused
- [ ] View Analysis Details tab → Data displays correctly
- [ ] View Architecture tab → React Flow diagram renders
- [ ] Use Explore tab → Can read files → Sandbox stays paused
- [ ] Delete sandbox → Status updates → Can no longer explore

### Quality Checks
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] No console errors in browser
- [ ] All tests pass (if applicable)
- [ ] Code follows existing patterns

---

## Notes for Agents

### Common Imports
```typescript
// Types
import { AnalysisJob, AnalysisContext, ReactFlowData } from '@/app/lib/types';
import type { Node, Edge } from '@xyflow/react';

// Components (Agent B provides)
import { ArchitectureDiagram } from '@/app/components/ArchitectureDiagram';
import { DataFlowDiagram } from '@/app/components/DataFlowDiagram';

// Components (Agent C provides)
import { AnalysisContextViewer } from '@/app/components/AnalysisContextViewer';
import { SandboxExplorer } from '@/app/components/SandboxExplorer';
```

### API Usage
```typescript
// Get job with all data
const response = await fetch(`/api/jobs/${jobId}`);
const job = await response.json();

// Explore sandbox
const exploreResponse = await fetch(`/api/jobs/${jobId}/explore`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'read', params: { path: '/repo/package.json' } })
});

// Delete sandbox
await fetch(`/api/jobs/${jobId}/sandbox`, { method: 'DELETE' });
```

### Styling Reference
```typescript
// Dark mode classes
text-zinc-800 dark:text-zinc-200
bg-white dark:bg-zinc-900
border-zinc-200 dark:border-zinc-800

// Accents
bg-blue-600 hover:bg-blue-700
text-blue-600 border-blue-600
```

---

## Success Criteria

This sprint is complete when:
1. ✅ AnalysisContext is preserved after job completion
2. ✅ Sandboxes are paused, not destroyed
3. ✅ Users can view detailed analysis data
4. ✅ Interactive React Flow diagrams display architecture
5. ✅ Users can explore sandbox files on-demand
6. ✅ Users can manually delete sandboxes when done
7. ✅ Old jobs degrade gracefully
8. ✅ No regressions in existing functionality

## Post-Sprint

After completion:
- [ ] Create AGENTS.md documenting coordination patterns used
- [ ] Update README with new features
- [ ] Document API endpoints
- [ ] Plan Supabase migration (data persistence)
