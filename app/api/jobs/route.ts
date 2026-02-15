import { NextResponse } from 'next/server';
import { jobStore } from '@/app/lib/jobs';
import { createAnalysisSandbox, destroySandbox, cloneRepoToSandbox } from '@/app/lib/blaxel';
import type { SandboxInstance } from '@blaxel/core';
import { analyzeRepoWithAgent } from '@/app/lib/agent';
import { generateTTS } from '@/app/lib/elevenlabs';
import { generatePodcastScript, type PodcastStyle } from '@/app/lib/script';
import type { AnalysisJob } from '@/app/lib/types';

// Simple UUID generator if crypto.randomUUID not available
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

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

    // Run analysis with Claude Haiku 4.5
    // Note: Repo is already cloned at /repo, so githubUrl not passed to agent
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

    // Mark job as completed immediately after analysis
    // Podcast generation is now separate to avoid wasting credits during testing
    jobStore.update(jobId, {
      status: 'completed',
      markdown,
      analysisMetrics: analysisMetrics || undefined,
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
    // Cleanup sandbox
    if (sandbox) {
      try {
        await destroySandbox(sandbox);
        console.log(`[${jobId}] Destroyed sandbox: ${sandboxName}`);
      } catch (cleanupError) {
        console.error(`[${jobId}] Failed to destroy sandbox ${sandboxName}:`, cleanupError);
      }
    }
  }
}

// Export helper functions for podcast generation endpoint
export { generatePodcastScript, generateTTS, getRepoName };
