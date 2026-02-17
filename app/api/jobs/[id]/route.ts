import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { jobStore } from '@/app/lib/jobs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    const { id: jobId } = await params;

    // Fetch job from Supabase
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check authorization - user must own the job or it must be public
    if (job.user_id !== user?.id && !job.is_public) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      id: job.id,
      github_url: job.github_url,
      status: job.status,
      markdown_content: job.markdown_content,
      script_content: job.script_content,
      audio_file_path: job.audio_file_path,
      error: job.error,
      created_at: job.created_at,
      updated_at: job.updated_at,
      analysis_context: job.analysis_context,
      sandbox_paused: job.sandbox_paused,
      react_flow_data: job.react_flow_data,
    });
  } catch (error) {
    console.error('Failed to get job:', error);
    return NextResponse.json(
      { error: 'Failed to get job' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: jobId } = await params;

    // Check ownership
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('user_id')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Soft delete
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', jobId);

    if (updateError) {
      console.error('Failed to delete job:', updateError);
      return NextResponse.json(
        { error: 'Failed to delete job' },
        { status: 500 }
      );
    }

    // Also remove from in-memory store
    jobStore.delete(jobId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete job:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  }
}
