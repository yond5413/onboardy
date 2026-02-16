# Onboardy - Project History

## Goal
Build a "Repo to Podcast" system that analyzes GitHub repositories and generates:
1. Clean system design documents for developer onboarding
2. Interactive React Flow diagrams for visualization
3. Podcast audio from the analysis

**Pricing Model**:
- Free tier: Haiku-only (prototype)
- Pro/Paid tier: Haiku + Sonnet refinement

## Discoveries

1. **Worktree cleanup**: Found and cleaned up broken worktree references (`onboardy-backend`, `onboardy-reactflow`, `onboardy-ui`) using `git worktree prune`

2. **Root cause of poor output**: Original `ANALYSIS_PROMPT` asked for both markdown + JSON in single response. AI prioritized JSON, resulting in 97% JSON, 3% markdown. Even after splitting prompts, Haiku still outputs conversational filler.

3. **Two-prompt approach implemented**: 
   - `analyzeRepoWithAgent()` - returns clean markdown
   - `generateDiagramWithAgent()` - returns React Flow JSON
   - Called sequentially in `route.ts`

4. **Post-processing needed**: Free tier still needs cleanup code to strip filler from Haiku output

5. **React Flow visual issues**: Current styling has poor color contrast, no legend, cluttered node layout

6. **User preferences**:
   - Documents: Overview, Tech Stack, Architecture (Mermaid), Key Components (table), Data Flow (numbered), Key Design Decisions (max 3), Getting Started
   - Diagrams: 12-15 nodes max, 150-200px spacing, left-to-right flow, color coding with legend

## Completed Work

- [x] Cleaned up worktrees
- [x] Updated `ANALYSIS_PROMPT` in `agent.ts` - onboarding-focused
- [x] Updated `DIAGRAM_PROMPT` in `agent.ts` - aesthetic guidelines
- [x] Split prompts into two: markdown + JSON
- [x] Added `generateDiagramWithAgent()` function in `agent.ts`
- [x] Added `DiagramResult` interface in `agent.ts`
- [x] Updated `route.ts` for two AI calls
- [x] TypeScript compiles without errors
- [x] ESLint passes (1 warning: unused FileAction in SandboxExplorer)

## Key Files

### Modified:
- `app/lib/agent.ts` - Prompts and AI functions
- `app/api/jobs/route.ts` - Job processing

### Reference:
- `app/components/ArchitectureDiagram.tsx` - React Flow component needing polish
- `app/components/ReactFlowDiagram.tsx` - Base component
- `app/components/DataFlowDiagram.tsx` - May need polish
- `app/lib/types.ts` - TypeScript types
- `sprint.md` - Original sprint spec
