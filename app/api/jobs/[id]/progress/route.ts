import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { pollJobProgress, pollJobEvents, type JobProgressStatus, type JobEventData } from '@/app/lib/agent';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { searchParams } = new URL(request.url);
    const includeEvents = searchParams.get('include_events') === 'true';
    const since = searchParams.get('since') || undefined;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch job to check authorization
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('user_id, is_public')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check authorization
    if (job.user_id !== user?.id && !job.is_public) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get progress from Supabase
    const progress = await pollJobProgress(jobId);

    // Get events if requested
    let events: JobEventData[] = [];
    if (includeEvents) {
      events = await pollJobEvents(jobId, since);
    }

    // Also get the main job status from jobs table
    const { data: mainJob } = await supabase
      .from('jobs')
      .select('status, markdown_content, error_message')
      .eq('id', jobId)
      .single();

    return NextResponse.json({
      jobId,
      progress: progress || {
        status: mainJob?.status || 'pending',
        progressMessage: mainJob?.status === 'completed' ? 'Analysis complete' : 'Waiting...',
        percentComplete: mainJob?.status === 'completed' ? 100 : 0,
      },
      jobStatus: mainJob?.status,
      markdownContent: mainJob?.markdown_content,
      error: mainJob?.error_message,
      events: includeEvents ? events : undefined,
    });
  } catch (error) {
    console.error('[progress] Failed to get job progress:', error);
    return NextResponse.json(
      { error: 'Failed to get job progress' },
      { status: 500 }
    );
  }
}
