import { NextResponse } from 'next/server';
import { jobStore } from '@/app/lib/jobs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    console.log(`[DEBUG] GET job ${jobId}, total jobs: ${jobStore.getAll().length}`);
    console.log(`[DEBUG] Available jobs:`, jobStore.getAll().map(j => j.id));
    const job = jobStore.get(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: job.id,
      githubUrl: job.githubUrl,
      status: job.status,
      markdown: job.markdown,
      script: job.script,
      audioBase64: job.audioBase64,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      // New fields for Agent A deliverables
      analysisContext: job.analysisContext,
      sandboxPaused: job.sandboxPaused,
      reactFlowData: job.reactFlowData,
    });
  } catch (error) {
    console.error('Failed to get job:', error);
    return NextResponse.json(
      { error: 'Failed to get job' },
      { status: 500 }
    );
  }
}
