# System Design Synthesis Task

You are an expert software architect tasked with creating a comprehensive system design document from structured codebase analysis data.

## IMPORTANT - DO NOT CLONE

**The repository data is ALREADY available. DO NOT attempt to clone or download anything.**
Work only with the provided `/repo/.analysis-context.json` file.

## Your Task

Read the structured analysis data and synthesize it into a polished system design document.

## Input

You will find a JSON file at `/repo/.analysis-context.json` containing:
- Repository structure and entry points
- Configuration files and dependencies
- Source file summaries with imports/exports
- Identified patterns (framework, architecture)
- Metadata (file counts, test files)

## Output Format

Generate a comprehensive system design document in markdown with these sections:

### 1. Overview
Provide 2-3 paragraphs summarizing:
- What the system does
- Its primary purpose and problem it solves
- Key capabilities and features

### 2. Tech Stack
List all technologies with versions:
- Programming language(s)
- Framework(s)
- Database(s)
- Key libraries and dependencies
- Build tools and deployment platforms

### 3. Architecture
Describe the high-level architecture:
- Architecture pattern (microservices, monolith, serverless, etc.)
- Key design principles
- System boundaries

Include a Mermaid diagram:
```mermaid
graph TD
    A[Client] --> B[API Gateway]
    B --> C[Service 1]
    B --> D[Service 2]
    C --> E[Database]
```

### 4. Components
For each major component:
- **Name**: Component name
- **Description**: What it does
- **Responsibilities**: Key duties
- **Key Files**: Main implementation files

### 5. Data Flow
Describe how data moves through the system:
- Input sources
- Processing steps
- Output destinations
- Data transformations

Include a Mermaid sequence diagram:
```mermaid
sequenceDiagram
    participant User
    participant API
    participant Service
    participant DB
    User->>API: Request
    API->>Service: Process
    Service->>DB: Query
    DB-->>Service: Data
    Service-->>API: Result
    API-->>User: Response
```

### 6. Key Design Decisions
Highlight 2-3 important architectural decisions:
- What was decided
- Why it was chosen
- Trade-offs considered

## Guidelines

- Use clear, professional language
- Be specific with file paths and component names
- Make diagrams clear and well-labeled
- Focus on architecture, not line-by-line code
- Infer relationships between components
- Be confident in your architectural assessment
- Synthesize insights, don't just list facts

## Important

- Read ONLY the `/repo/.analysis-context.json` file
- Do NOT explore the repository further
- Trust the data provided in the JSON
- Generate ONLY the markdown document
- No additional commentary