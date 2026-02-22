# Onboardy Product Requirements Document (PRD)

## Document Metadata
- **Product**: Onboardy (Repo-to-Architecture + Podcast)
- **Version**: v1.0 (Roadmap PRD)
- **Status**: Draft
- **Date**: 2026-02-19
- **Author**: Product/Engineering

---

## 1. Executive Summary

Onboardy currently provides a strong end-to-end flow: repository analysis, architecture artifact generation, optional podcast generation, and contextual chat over analyzed repositories. The next phase should focus on transforming Onboardy from a one-off analysis tool into a collaborative, recurring engineering intelligence platform.

This PRD defines a roadmap across three horizons:
1. **Near-term conversion and reliability improvements**
2. **Team collaboration and recurring usage loops**
3. **Platform differentiation and enterprise readiness**

It also introduces two high-impact additions requested by stakeholders:
- **Graph-aware contextual chat** (React Flow node/edge → guided chat)
- **“Who to ask” recommendations** (git-history-derived ownership hints)

---

## 2. Background and Current State

### 2.1 What exists today
- Async analysis jobs with lifecycle status and event streaming.
- Generated outputs: design markdown, architecture/data-flow graph JSON, analysis context.
- Post-analysis chat tied to a job and persisted conversation history.
- Podcast generation from analysis output in multiple styles.
- User dashboard with job management and soft-delete behavior.

### 2.2 Product strengths
- Fast time-to-value for onboarding engineers.
- Multiple output modalities (text, visual, audio, chat).
- Good foundation for extensibility with sandboxed analysis and structured artifacts.

### 2.3 Product gaps
- Limited interactivity between architecture view and chat.
- No explicit ownership guidance (“who should I ask about this area?”).
- Limited collaboration workflows for teams.
- Limited recurring analysis workflows (e.g., scheduled re-analysis and diffs).

---

## 3. Product Vision

**Vision statement**: 
> Help engineering teams understand any codebase faster, collaborate better, and continuously maintain architectural clarity as systems evolve.

### Strategic outcomes
- Reduce developer onboarding time.
- Improve debugging and architectural decision speed.
- Increase cross-team codebase discoverability.
- Build a reusable, sticky repository intelligence layer.

---

## 4. Goals and Non-Goals

### 4.1 Goals (next 2 quarters)
1. Increase analysis-to-chat engagement by making architecture views actionable.
2. Enable practical ownership discovery for components and features.
3. Improve reliability, transparency, and trust in analysis runs.
4. Establish foundational collaboration and repeat-use workflows.

### 4.2 Non-goals (for this cycle)
- Full static-code correctness guarantees.
- Replacing source control ownership systems as authoritative truth.
- Building a full project management suite.

### 4.3 Product Modes (explicit)
To avoid roadmap ambiguity, features are prioritized in two distinct operating modes:

1. **Solo Developer Mode (single user, personal workflow first)**
   - Fast analysis turnarounds.
   - Guided architecture understanding and chat exploration.
   - Lightweight ownership hints for personal decision making.

2. **Workspace/Team Mode (multi-user collaboration second)**
   - Shared analyses, permissions, and organizational controls.
   - Team-level ownership visibility and governance.
   - Repeatable, scheduled, and policy-aware workflows.

Roadmap commitments in this PRD intentionally deliver **Solo Developer Mode first**, then layer in **Workspace/Team Mode** capabilities.

---

## 5. User Personas and Jobs-to-be-Done

### Persona A: New Engineer
- **JTBD**: “I need to understand this repo quickly and know where to start.”
- Needs: architecture map, contextual Q&A, key file paths, likely owners.

### Persona B: Senior Engineer / Tech Lead
- **JTBD**: “I need to assess architecture tradeoffs and guide implementation.”
- Needs: impact analysis, data-flow understanding, ownership confidence, sharable artifacts.

### Persona C: Engineering Manager
- **JTBD**: “I need visibility into system areas and who can unblock work.”
- Needs: ownership summaries, trend reports, repeatable analyses.

---

## 6. Problem Statements

1. Users can see architecture nodes but cannot directly pivot those into focused exploratory chat.
2. Users frequently ask “Who owns this?” but there is no ownership inference from repository history.
3. Users need recurring snapshots and diffs to keep architecture docs current.
4. Teams need stronger collaboration, sharing, and governance controls.

---

## 7. Roadmap Overview

### 7.1 Sequencing rule (Solo first, Team second)
- **Horizon 1** must remain optimized for Solo Developer Mode to ensure fast value for one developer.
- **Horizon 2+** introduces Workspace/Team Mode without blocking solo workflows.

### 7.2 Mode-by-mode feature split

| Capability | Solo Developer Mode (Phase 1) | Workspace/Team Mode (Phase 2) |
|---|---|---|
| Graph-aware chat | Node/edge click → chat prompt + contextual answers | Shared discussion threads and team-visible graph annotations |
| Who-to-ask | Likely owners from git history for user guidance | Team-level ownership dashboards + role-based visibility |
| Sharing | Basic read-only share links | Workspace-level access policies and permission controls |
| Re-analysis | Manual + scheduled for single user | Org-wide schedules, notifications, and governance hooks |
| Cost controls | Personal usage and budget hints | Workspace budgets, limits, and policy enforcement |

## Horizon 1 (0–6 weeks): Activation + UX reliability
1. **Progress UX v2**: stage-level progress, ETA, partial-failure transparency.
2. **Share v1**: simple read-only share links for completed analyses.
3. **Podcast controls v2**: duration/tone/audience controls and script pre-edit.
4. **Graph-aware chat (MVP)**: click graph node/edge to seed contextual chat.
5. **Who-to-ask (Solo MVP)**: git-history-based likely owners visible per component for individual developer workflows.

## Horizon 2 (6–12 weeks): Collaboration + repeat usage
6. **Who-to-ask (Team mode)**: confidence tuning, team filters, and org visibility controls.
7. **Scheduled re-analysis**: watch repos and refresh outputs over time.
8. **Diff briefs**: “what changed” architecture impact summaries between runs.
9. **Workspace/team basics**: shared visibility and role-aware access.

## Horizon 3 (3–6 months): Differentiation + enterprise
10. **Cross-repo knowledge graph and semantic retrieval.**
11. **Governance controls**: retention, redaction, access audit.
12. **Cost controls**: budget-aware model routing and usage limits.

---

## 8. Detailed Feature Requirements

## 8.1 Graph-Aware Contextual Chat (New)

### Objective
Enable users to click architecture graph elements and immediately ask high-quality, context-specific questions.

### User stories
- As a new engineer, when I click a service node, I can ask “Explain this service responsibilities and dependencies” without manually crafting prompt context.
- As a tech lead, when I click an edge, I can ask “What data contract flows between these components?”

### Functional requirements
1. **Node interaction**
   - Clicking a node surfaces quick actions: Explain, Trace Flow, Debug Here, Files to Read.
2. **Context payload**
   - Chat requests can include optional graph context:
     - node ID
     - node label/type
     - linked edge IDs
     - optional neighboring node labels
3. **Chat integration**
   - Selecting an action auto-switches user to chat panel with prefilled prompt.
   - Users can edit before sending.
4. **Persistence**
   - Store graph-context metadata with each chat turn for replay and analytics.
5. **Response enhancement**
   - Assistant should return:
     - concise explanation
     - relevant files
     - related components
     - recommended next question

### Non-functional requirements
- Interaction to prefilled chat should occur in <250ms client-side.
- No regression in existing chat behavior.

### Success metrics
- +30% chat initiation rate from architecture tab.
- +20% session depth (messages per active chat session).
- >70% helpfulness rating on graph-triggered answers.

### Mode-specific rollout
- **Solo Developer Mode**: ship with local prompt templates and per-user telemetry.
- **Workspace/Team Mode**: add shared context memory and permissions-aware chat actions.

### Risks and mitigations
- **Risk**: noisy prompts from weak graph labeling.
  - **Mitigation**: sanitize and enrich labels with surrounding metadata before prompt creation.

---

## 8.2 “Who to Ask” Ownership Recommendations (New)

### Objective
Provide high-confidence, explainable suggestions for who can help on a given component/feature area.

### User stories
- As an engineer, I want likely owner suggestions per component so I can quickly route questions.
- As a manager, I want lightweight ownership visibility to reduce coordination overhead.

### Functional requirements
1. **Ownership extraction pipeline**
   - Derive candidate owners from git history for key files/components:
     - commit frequency
     - recency weighting
     - line-level contribution where available
2. **Component mapping**
   - Map architecture nodes/components to associated key files.
3. **Owner scoring model**
   - Compute confidence score per candidate owner.
4. **UI surfaces**
   - In architecture/details view, show “Likely owners” and confidence level.
   - In chat responses, optionally suggest “People to ask.”
5. **Explainability**
   - Show rationale snippet, e.g., “Most recent contributor in last 90 days; 12 commits touching related files.”

### Data requirements
- Git commit metadata (author name/email, commit timestamp, touched files).
- Optional CODEOWNERS augmentation if present.

### Privacy and compliance
- Allow org-level toggle to disable people recommendations.
- Redact personal email where policy requires (display name only).

### Success metrics
- 25% reduction in “ownership clarification” time (survey/telemetry proxy).
- 40% of completed analyses show at least one confident owner recommendation.

### Mode-specific rollout
- **Solo Developer Mode**: show top 1-3 likely owners and rationale per component.
- **Workspace/Team Mode**: add team-directory mapping, role filters, and privacy controls.

### Risks and mitigations
- **Risk**: ownership inferred from stale history.
  - **Mitigation**: recency weighting and stale-confidence downgrade.
- **Risk**: bot/service-account noise.
  - **Mitigation**: identity filtering heuristics.

---

## 8.3 Additional Recommended Features

1. **Insight Cards**
   - Auto-generate “Top risks”, “Hot paths”, “Dependency bottlenecks” cards.
2. **Actionable Runbooks**
   - Generate onboarding checklist per repo and per role.
3. **Failure Replay**
   - Save analysis run trace for debugging and repeatability.
4. **Feedback Loop**
   - Thumbs up/down on answers and docs, with correction capture.
5. **Public API / Webhooks**
   - Trigger analyses from CI or external tools.

---

## 9. Prioritization Matrix

### Scoring dimensions
- **Impact** (user/business value)
- **Effort** (engineering complexity)
- **Risk** (delivery/quality uncertainty)
- **Time-to-Value**

### Proposed order
1. Graph-aware chat MVP (high impact / low-medium effort)
2. Progress UX v2 (high trust impact / low effort)
3. Share v1 (medium-high impact / low effort)
4. Who-to-ask Solo MVP (high impact / medium effort)
5. Scheduled re-analysis + diff briefs (high retention / medium-high effort)
6. Who-to-ask Team Mode + workspace policies (high collaboration impact / medium effort)

---

## 10. Delivery Plan (2-Sprint Draft)

## Sprint 1
- Graph node click → chat prefill integration.
- Add optional graph context fields in chat request and persistence.
- Basic quick actions for node-level prompts.
- Telemetry for graph-originated chats.
- Solo-mode UX validation (single-user flow completion and latency).

## Sprint 2
- Ownership extractor prototype from git logs.
- Owner scoring and confidence computation.
- UI badges in Architecture/Details tabs.
- Chat response enrichment with likely owner suggestions.
- Workspace/team-mode scope definition and access-control requirements.

---

## 11. Instrumentation and Analytics

Track:
- Analysis funnel: create → completed → chat opened → follow-up actions.
- Graph interaction events: node clicked, action selected, prompt sent.
- Ownership panel engagement: viewed, copied, used in follow-up actions.
- Chat quality: resolution proxy, user feedback score, follow-up depth.

---

## 12. Open Questions

1. Should ownership recommendations be generated synchronously with analysis completion or lazily on-demand?
2. What policy should govern displaying contributor identity in public/shared analyses?
3. Do we require CODEOWNERS support in MVP or defer to v2?
4. Should edge-level contextual chat ship in MVP or immediately after node-level interactions?

---

## 13. Acceptance Criteria (Roadmap PRD Approval)

- PRD reviewed by product + engineering stakeholders.
- Agreement on Horizon 1 priorities and sequence.
- Named owners for sprint implementation planning.
- Metrics instrumentation requirements accepted.

---

## 14. Appendix: Suggested API/Data Contract Extensions

### Chat API extension (illustrative)
```json
{
  "message": "Explain this service and how it interacts with auth",
  "graphContext": {
    "nodeId": "auth-service",
    "nodeLabel": "Auth Service",
    "nodeType": "service",
    "relatedEdges": ["web-to-auth", "auth-to-db"],
    "neighborNodes": ["Web App", "User DB"]
  }
}
```

### Ownership data shape (illustrative)
```json
{
  "componentId": "auth-service",
  "owners": [
    {
      "name": "Jane Doe",
      "email": "redacted",
      "confidence": 0.86,
      "reasons": [
        "12 related commits in last 90 days",
        "Most recent non-bot contributor"
      ]
    }
  ]
}
```
