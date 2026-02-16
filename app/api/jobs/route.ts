import { NextResponse } from 'next/server';
import { jobStore } from '@/app/lib/jobs';
import { createAnalysisSandbox, pauseSandbox, cloneRepoToSandbox, collectAnalysisContext } from '@/app/lib/blaxel';
import type { SandboxInstance } from '@blaxel/core';
import { analyzeRepoWithAgent, generateDiagramWithAgent, type DiagramResult } from '@/app/lib/agent';
import { generateTTS } from '@/app/lib/elevenlabs';
import { generatePodcastScript, type PodcastStyle } from '@/app/lib/script';
import type { AnalysisJob, AnalysisContext, ReactFlowData } from '@/app/lib/types';

// Simple UUID generator if crypto.randomUUID not available
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Extract structured JSON from markdown response
// Extract repo name from GitHub URL
function getRepoName(githubUrl: string): string {
  const match = githubUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
  return match ? match[1] : 'repository';
}

export async function POST(request: Request) {
  try {
    const { githubUrl, podcastStyle } = await request.json();

    if (!githubUrl) {
      return NextResponse.json(
        { error: 'githubUrl is required' },
        { status: 400 }
      );
    }

    // Validate GitHub URL
    if (!githubUrl.startsWith('https://github.com/')) {
      return NextResponse.json(
        { error: 'Invalid GitHub URL' },
        { status: 400 }
      );
    }

    const jobId = generateId();
    const shortId = jobId.substring(0, 8);
    const sandboxName = `analysis-${shortId}`;

    // Create job entry
    const job: AnalysisJob = {
      id: jobId,
      githubUrl,
      status: 'queued',
      sandboxName,
      podcastStyle: (podcastStyle as PodcastStyle) || 'overview',
      createdAt: new Date(),
    };

    jobStore.create(job);
    console.log(`[DEBUG] Job created: ${jobId}, style: ${job.podcastStyle}, total jobs: ${jobStore.getAll().length}`);

    // Start background processing
    processJob(jobId, githubUrl, sandboxName).catch((error) => {
      console.error(`Job ${jobId} failed:`, error);
      jobStore.update(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (error) {
    console.error('Failed to create job:', error);
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    );
  }
}

async function processJob(
  jobId: string,
  githubUrl: string,
  sandboxName: string
): Promise<void> {
  let sandbox: SandboxInstance | null = null;

  try {
    // Update status to cloning
    jobStore.update(jobId, { status: 'cloning' });

    // Create sandbox
    sandbox = await createAnalysisSandbox(sandboxName);
    console.log(`[${jobId}] Created sandbox: ${sandboxName}`);

    // GUARDRAIL: Clone repo in sandbox via SDK - prevents local filesystem pollution
    console.log(`[${jobId}] Cloning repository in sandbox...`);
    const cloneResult = await cloneRepoToSandbox(sandbox, githubUrl);
    
    if (!cloneResult.success) {
      throw new Error(`Failed to clone repository: ${cloneResult.error}`);
    }
    
    console.log(`[${jobId}] Repository cloned successfully in sandbox`);

    // Update status to analyzing
    jobStore.update(jobId, { status: 'analyzing' });

    // Step 1: Generate clean markdown system design document
    const result = await analyzeRepoWithAgent(
      sandbox,
      jobId,
      (progress) => {
        console.log(`[${jobId}] ${progress}`);
      }
    );
    
    const markdown = result.markdown;
    const analysisMetrics = result.metrics;

    console.log(`[${jobId}] Analysis complete, markdown: ${markdown.length} chars`);

    // Step 2: Generate React Flow diagram data (separate call)
    let diagramResult: DiagramResult | undefined;
    let reactFlowData: ReactFlowData | undefined;
    try {
      diagramResult = await generateDiagramWithAgent(
        sandbox,
        jobId,
        (progress) => {
          console.log(`[${jobId}] ${progress}`);
        }
      );
      
      if (diagramResult.reactFlowData) {
        reactFlowData = diagramResult.reactFlowData;
        console.log(`[${jobId}] Generated reactFlowData`);
      }
    } catch (diagramError) {
      console.error(`[${jobId}] Failed to generate diagram:`, diagramError);
      // Continue without diagram - not a fatal error
    }

    // Collect analysis context from sandbox (for file structure)
    let analysisContext: AnalysisContext | undefined;
    try {
      analysisContext = await collectAnalysisContext(sandbox, githubUrl);
      if (analysisContext) {
        console.log(`[${jobId}] Collected analysis context`);
      }
    } catch (contextError) {
      console.error(`[${jobId}] Failed to collect analysis context:`, contextError);
      // Continue without context - not a fatal error
    }

    // Use patterns from diagram generation (if available) or fallback to context
    if (diagramResult?.patterns && analysisContext) {
      analysisContext.patterns = {
        framework: diagramResult.patterns.framework || 'Unknown',
        architecture: diagramResult.patterns.architecture || 'Unknown',
        keyModules: diagramResult.patterns.keyModules || [],
      };
    } else if (analysisContext) {
      // Keep the basic patterns from collectAnalysisContext
      analysisContext.patterns = analysisContext.patterns || {
        framework: 'Unknown',
        architecture: 'Unknown',
        keyModules: [],
      };
    }

    // Mark job as completed
    jobStore.update(jobId, {
      status: 'completed',
      markdown,
      analysisMetrics: analysisMetrics || undefined,
      analysisContext,
      reactFlowData,
    });

    console.log(`[${jobId}] Job completed successfully`);
    
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'object' && error !== null 
        ? JSON.stringify(error, null, 2)
        : String(error);
    jobStore.update(jobId, {
      status: 'failed',
      error: errorMessage,
    });
  } finally {
    // Pause sandbox instead of destroying to preserve state for exploration
    if (sandbox) {
      try {
        await pauseSandbox(sandbox);
        jobStore.update(jobId, { sandboxPaused: true });
        console.log(`[${jobId}] Paused sandbox: ${sandboxName}`);
      } catch (cleanupError) {
        console.error(`[${jobId}] Failed to pause sandbox ${sandboxName}:`, cleanupError);
      }
    }
  }
}

// Export helper functions for podcast generation endpoint
export { generatePodcastScript, generateTTS, getRepoName };
