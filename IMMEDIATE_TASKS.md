# Immediate Tasks

## Phase 1: Post-Processing (Priority: High)
Add `cleanMarkdown()` function in `app/api/jobs/route.ts` to strip conversational filler from Haiku output.

**Steps**:
1. Create `cleanMarkdown()` function that:
   - Removes leading phrases like "Here's", "Sure", "Let me", etc.
   - Removes trailing phrases like "Let me know", "Hope this helps", etc.
   - Strips excessive newlines
   - Keeps only the core markdown content
2. Integrate `cleanMarkdown()` after calling `analyzeRepoWithAgent()`
3. Test with a new job to verify clean output

## Phase 2: React Flow Polish (Priority: High)
Improve `app/components/ArchitectureDiagram.tsx` styling.

**Steps**:
1. Update color scheme for better contrast (darker nodes, lighter edges)
2. Add legend component showing node types
3. Improve node spacing (150-200px)
4. Ensure left-to-right flow orientation
5. Add proper font styling for readability

## Phase 3: Testing (Priority: High)
Verify free-tier output is clean and readable.

**Steps**:
1. Create a test job with a sample repo
2. Check markdown output is clean (no filler)
3. Check diagram renders correctly with legend
4. Verify document sections match user preferences

## Future (Not Started)
- Implement Pro tier with Sonnet refinement
- Add tier selection to job creation
- Improve DataFlowDiagram component
