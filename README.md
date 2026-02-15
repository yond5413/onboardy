# Onboardy - Repo to Podcast

Transform any GitHub repository into an AI-generated system design podcast. This Next.js application analyzes codebases and creates technical podcasts with audio narration.

## Features

- **Repository Analysis**: Analyzes GitHub repos using AI agents to understand architecture
- **System Design Documents**: Generates comprehensive markdown documentation with Mermaid diagrams
- **Podcast Generation**: Creates narrated podcasts in two styles:
  - High-Level Overview: Business-friendly explanation
  - Technical Deep-Dive: Detailed implementation discussion
- **Architecture Visualization**: Renders Mermaid diagrams to visualize system architecture
- **Downloadable Assets**: Export audio, scripts, and documentation

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Styling**: Tailwind CSS 4
- **AI/ML**: Anthropic Claude Agent SDK
- **Voice**: ElevenLabs API for text-to-speech
- **Deployment**: Blaxel platform
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

# Blaxel API
BL_API_KEY=your-blaxel-key
BL_WORKSPACE=your-workspace
BL_REGION=your-region

# ElevenLabs API
ELEVEN_LABS_API_KEY=your-elevenlabs-key

# OpenRouter API (optional)
OPENROUTER_API_KEY=your-openrouter-key

# GitHub Token (optional, for private repos)
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

1. Enter a GitHub repository URL (e.g., `https://github.com/user/repo`)
2. Select podcast style:
   - **High-Level Overview**: For executives, non-technical stakeholders
   - **Technical Deep-Dive**: For engineers, architects
3. Click "Analyze Repository"
4. Wait for the AI to process (typically 2-5 minutes)
5. View the results:
   - **System Design Document**: Markdown with architecture analysis
   - **Podcast Script**: Conversation transcript
   - **Architecture Diagram**: Mermaid visualization
   - **Podcast Audio**: Downloadable MP3

## Project Structure

```
app/
├── api/jobs/           # Job management API routes
├── lib/
│   ├── agent.ts        # AI agent orchestration
│   ├── blaxel.ts       # Blaxel sandbox integration
│   ├── elevenlabs.ts   # Text-to-speech generation
│   ├── hybrid-analyzer.ts  # Two-phase analysis (Haiku + Sonnet)
│   ├── script.ts       # Podcast script generation
│   └── prompts/        # AI prompts for analysis
├── page.tsx            # Main UI component
└── layout.tsx          # Root layout
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude agents |
| `BL_API_KEY` | Yes | Blaxel API key for sandbox management |
| `BL_WORKSPACE` | Yes | Blaxel workspace name |
| `BL_REGION` | Yes | Blaxel region (e.g., `us-pdx-1`) |
| `ELEVEN_LABS_API_KEY` | Yes | ElevenLabs API for audio generation |
| `OPENROUTER_API_KEY` | No | Optional OpenRouter for additional models |
| `GITHUB_TOKEN` | No | For accessing private repositories |
| `HOST` | No | Server host (default: 0.0.0.0) |
| `PORT` | No | Server port (default: 3000) |

## How It Works

1. **Repository Cloning**: Code is cloned into a Blaxel sandbox
2. **Phase 1 (Data Collection)**: Fast Haiku model collects repo structure and key files
3. **Phase 2 (Synthesis)**: Sonnet model generates comprehensive analysis
4. **Script Generation**: AI creates conversational podcast scripts
5. **Audio Generation**: ElevenLabs TTS converts scripts to audio
6. **Delivery**: All assets returned via the UI

## License

MIT
