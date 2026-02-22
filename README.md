# Onboardy - AI-Powered Codebase Understanding Platform

Transform any GitHub repository into a comprehensive system design analysis with AI-generated documentation, interactive architecture diagrams, and contextual Q&A.

## Features

### Analysis & Documentation
- **Repository Analysis**: AI-powered codebase analysis using Claude agents in a sandboxed environment
- **Multi-Style Documentation**: Generates three document types:
  - Executive Summary: Business-friendly overview for stakeholders
  - Technical Deep-Dive: Detailed implementation discussion for engineers
  - Onboarding Guide: Developer getting-started checklist
- **Architecture Visualization**: Interactive React Flow diagrams with auto-layout
- **Data Flow Diagrams**: Visual representation of how data moves through the system
- **Podcast Generation**: Optional AI-narrated audio summaries (High-Level or Technical styles)

### Interactive Exploration
- **Graph-Aware Chat**: Click any architecture node to ask contextual questions about that component
- **Ownership Recommendations**: "Who to Ask" suggests likely owners based on git history
- **Sandbox Explorer**: Browse the cloned repository files directly in the UI
- **Stage Retry**: Retry individual failed analysis stages without re-running everything

### Collaboration & Management
- **User Authentication**: Full auth system with Supabase (login, signup, password management)
- **Dashboard**: Track all your analyses with stats and management table
- **Sharing**: Generate public read-only links to share analyses with stakeholders
- **Real-Time Progress**: Live streaming of analysis logs with stage-by-stage status

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Styling**: Tailwind CSS 4 + shadcn/ui components
- **AI/ML**: Anthropic Claude Agent SDK
- **Database & Auth**: Supabase (PostgreSQL + Auth)
- **Diagrams**: React Flow (@xyflow/react) + Mermaid
- **Voice**: ElevenLabs API for podcast audio generation
- **Sandbox**: Blaxel for isolated code execution
- **TypeScript**: Full type safety

## Getting Started

### Prerequisites

- Node.js 20+
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd onboardy
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment file and add your API keys:
```bash
cp .env.example .env.local
```

4. Edit `.env.local` with your actual API keys:
```bash
# Anthropic API (for Claude Agent SDK)
ANTHROPIC_API_KEY=your-anthropic-key

# Blaxel API (for sandboxed analysis)
BL_API_KEY=your-blaxel-key
BL_REGION=us-pdx-1

# Supabase (for auth & database)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-key

# ElevenLabs API (for podcast audio)
ELEVEN_LABS_API_KEY=your-elevenlabs-key

# GitHub Token (for private repos)
GITHUB_TOKEN=your-github-token
```

### Running Locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

## Usage

### Creating an Analysis

1. Sign up or log in to your account
2. Click "New Analysis" 
3. Enter a GitHub repository URL (e.g., `https://github.com/user/repo`)
4. Select podcast style (optional):
   - **High-Level Overview**: For executives, non-technical stakeholders
   - **Technical Deep-Dive**: For engineers, architects
5. Click "Analyze Repository"
6. Watch real-time progress with stage-by-stage logs

### Viewing Results

Once analysis completes, explore 8 tabs of insights:

| Tab | Description |
|-----|-------------|
| **Overview** | Executive summary for business stakeholders |
| **Onboarding** | Developer getting-started guide with key files and setup |
| **Technical** | Detailed technical deep-dive with implementation details |
| **Architecture** | Interactive React Flow diagram - click nodes for details |
| **Script** | Generated podcast script (editable before audio generation) |
| **Chat** | AI-powered Q&A - click architecture nodes for context-aware answers |
| **Details** | Ownership data ("Who to Ask") + analysis metadata |
| **Explore** | File browser for the cloned repository |

### Graph-Aware Chat

In the Architecture tab:
1. Click any node in the diagram
2. Select an action: Explain, Trace Flow, Debug, or Files
3. The chat panel prefills with a contextual prompt
4. Ask follow-up questions about that component

### Sharing an Analysis

1. Open any completed analysis
2. Toggle "Share" to make it public
3. Copy the generated link to share with stakeholders

## Project Structure

```
onboardy/
├── app/
│   ├── (app)/                    # Authenticated routes
│   │   ├── dashboard/            # User dashboard with job table
│   │   ├── jobs/[id]/            # Job detail with 8-tab results
│   │   ├── new/                  # Create new analysis
│   │   └── settings/             # User settings
│   ├── (auth)/                   # Authentication routes
│   │   ├── login/
│   │   ├── signup/
│   │   └── forgot-password/
│   ├── api/
│   │   ├── jobs/                 # Job CRUD + chat API
│   │   └── share/                # Public share endpoints
│   ├── components/               # React components
│   │   ├── ChatPanel.tsx         # Graph-aware chat
│   │   ├── ArchitectureDiagram.tsx  # React Flow diagrams
│   │   └── ...
│   └── lib/
│       ├── agent.ts              # AI agent orchestration
│       ├── hybrid-analyzer.ts     # 2-phase analysis
│       ├── chat-agent.ts          # Chat with graph context
│       └── supabase/             # Supabase client
├── supabase/
│   └── migrations/               # Database migrations
└── components/ui/                 # shadcn/ui components
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude agents |
| `BL_API_KEY` | Yes | Blaxel API key for sandbox management |
| `BL_REGION` | Yes | Blaxel region (e.g., `us-pdx-1`) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `ELEVEN_LABS_API_KEY` | Yes | ElevenLabs API for audio generation |
| `GITHUB_TOKEN` | No | For accessing private repositories |

## How It Works

1. **Repository Cloning**: Code is cloned into a Blaxel sandbox for secure analysis
2. **Phase 1 (Data Collection)**: Fast Haiku model collects repo structure and key files
3. **Phase 2 (Synthesis)**: Sonnet model generates comprehensive analysis and diagrams
4. **Graph Generation**: Architecture and data flow diagrams are created
5. **Ownership Extraction**: Git history is analyzed to identify likely owners
6. **Chat Ready**: Analysis context is stored for contextual Q&A
7. **Optional Podcast**: Script is generated and converted to audio via ElevenLabs

## License

MIT
