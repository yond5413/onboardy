import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { jobStore } from '@/app/lib/jobs';
import { deleteSandbox } from '@/app/lib/blaxel';

// Async function to delete sandbox with retry logic
async function deleteSandboxWithRetry(
  sandboxName: string,
  jobId: string,
  attempts = 0
): Promise<void> {
  const maxAttempts = 4;
  const delays = [0, 1000, 5000, 15000]; // immediate, 1s, 5s, 15s

  try {
    if (attempts > 0) {
      console.log(`[${jobId}] Retrying sandbox deletion (attempt ${attempts}/${maxAttempts})...`);
      await new Promise((resolve) => setTimeout(resolve, delays[attempts]));
    }

    await deleteSandbox(sandboxName);
    console.log(`[${jobId}] Sandbox deleted successfully`);

    // Update database to reflect sandbox is destroyed
    const supabase = await createClient();
    await supabase
      .from('jobs')
      .update({ sandbox_paused: false })
      .eq('id', jobId);
  } catch (error) {
    console.error(`[${jobId}] Failed to delete sandbox (attempt ${attempts + 1}):`, error);

    if (attempts < maxAttempts - 1) {
      // Retry with exponential backoff
      deleteSandboxWithRetry(sandboxName, jobId, attempts + 1);
    } else {
      console.error(`[${jobId}] Failed to delete sandbox after ${maxAttempts} attempts`);
      // Log for monitoring - in production, you might want to store this in a cleanup_failures table
    }
  }
}

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
      markdown_executive_summary: job.markdown_executive_summary,
      markdown_technical_deep_dive: job.markdown_technical_deep_dive,
      script_content: job.script_content,
      audio_file_path: job.audio_file_path,
      error: job.error_message,
      created_at: job.created_at,
      updated_at: job.updated_at,
      analysis_context: job.analysis_context,
      sandbox_paused: job.sandbox_paused,
      react_flow_data: job.react_flow_data,
      is_public: job.is_public,
      share_token: job.share_token,
    });
  } catch (error) {
    console.error('Failed to get job:', error);
    return NextResponse.json(
      { error: 'Failed to get job' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const body = await request.json();
    const { action } = body;

    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('user_id, is_public, share_token')
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

    if (action === 'share') {
      const { data, error: shareError } = await supabase.rpc('share_job', { job_uuid: jobId });
      
      if (shareError) {
        const token = crypto.randomUUID().slice(0, 12);
        const { error: updateError } = await supabase
          .from('jobs')
          .update({ is_public: true, share_token: token })
          .eq('id', jobId);

        if (updateError) {
          return NextResponse.json(
            { error: 'Failed to share job' },
            { status: 500 }
          );
        }

        return NextResponse.json({ 
          is_public: true, 
          share_token: token,
          share_url: `/share/${token}`
        });
      }

      return NextResponse.json({ 
        is_public: true, 
        share_token: data,
        share_url: `/share/${data}`
      });
    } else if (action === 'unshare') {
      const { error: unshareError } = await supabase.rpc('unshare_job', { job_uuid: jobId });
      
      if (unshareError) {
        const { error: updateError } = await supabase
          .from('jobs')
          .update({ is_public: false, share_token: null })
          .eq('id', jobId);

        if (updateError) {
          return NextResponse.json(
            { error: 'Failed to unshare job' },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({ is_public: false, share_token: null });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to update job:', error);
    return NextResponse.json(
      { error: 'Failed to update job' },
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
      console.log('[DELETE] No user authenticated');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: jobId } = await params;
    console.log(`[DELETE] Attempting to delete job ${jobId} for user ${user.id}`);

    // Fetch job with all fields needed for cleanup
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('user_id, sandbox_name, sandbox_paused')
      .eq('id', jobId)
      .single();

    if (fetchError) {
      console.log(`[DELETE] Fetch error:`, fetchError);
    }
    if (!job) {
      console.log(`[DELETE] Job not found: ${jobId}`);
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    console.log(`[DELETE] Job owner: ${job.user_id}, Current user: ${user.id}`);
    if (job.user_id !== user.id) {
      console.log(`[DELETE] Unauthorized - user mismatch`);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Start async sandbox cleanup if sandbox exists and is paused
    if (job.sandbox_name && job.sandbox_paused) {
      console.log(`[${jobId}] Initiating sandbox deletion for: ${job.sandbox_name}`);
      // Fire and forget - don't await
      deleteSandboxWithRetry(job.sandbox_name, jobId);
    }

    // Clear all data fields to free up space, then soft delete
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        // Clear content fields to free DB space
        markdown_content: null,
        script_content: null,
        audio_file_path: null,
        analysis_context: null,
        react_flow_data: null,
        analysis_metrics: null,
        error_message: null,
        // Soft delete
        deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
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

    console.log(`[${jobId}] Job soft deleted successfully`);

    return NextResponse.json({
      success: true,
      cleanupInitiated: !!(job.sandbox_name && job.sandbox_paused),
    });
  } catch (error) {
    console.error('Failed to delete job:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  }
}
