import { NextResponse } from 'next/server';
import { jobStore } from '@/app/lib/jobs';
import { createAnalysisSandbox, destroySandbox } from '@/app/lib/blaxel';
import type { SandboxInstance } from '@blaxel/core';
import { analyzeRepoWithAgent } from '@/app/lib/agent';
import { generatePodcast } from '@/app/lib/elevenlabs';
import type { AnalysisJob } from '@/app/lib/types';

// Simple UUID generator if crypto.randomUUID not available
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

export async function POST(request: Request) {
  try {
    const { githubUrl } = await request.json();

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
      createdAt: new Date(),
    };

    jobStore.create(job);
    console.log(`[DEBUG] Job created: ${jobId}, total jobs: ${jobStore.getAll().length}`);

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
    console.log(`Created sandbox: ${sandboxName}`);

    // Update status to analyzing
    jobStore.update(jobId, { status: 'analyzing' });

    // Run analysis with Claude Agent SDK
    const markdown = await analyzeRepoWithAgent(
      sandbox,
      githubUrl,
      (progress) => {
        console.log(`[${jobId}] ${progress}`);
      }
    );

    console.log(`[${jobId}] Analysis complete`);

    // Update status to generating
    jobStore.update(jobId, { status: 'generating' });

    // Generate podcast
    const audioUrl = await generatePodcast(markdown);

    console.log(`[${jobId}] Podcast generated: ${audioUrl}`);

    // Update job with results
    jobStore.update(jobId, {
      status: 'completed',
      markdown,
      audioUrl,
    });
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
        console.log(`Destroyed sandbox: ${sandboxName}`);
      } catch (cleanupError) {
        console.error(`Failed to destroy sandbox ${sandboxName}:`, cleanupError);
      }
    }
  }
}
