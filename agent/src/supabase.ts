import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('[Supabase] Missing SUPABASE_URL or SUPABASE keys, progress tracking disabled');
    return null;
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey);
  console.log('[Supabase] Client initialized');
  return supabaseClient;
}

export interface JobEvent {
  job_id: string;
  event_type: 'started' | 'progress' | 'thinking' | 'tool_use' | 'stage_start' | 'stage_complete' | 'stage_failed' | 'complete' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export async function emitJobEvent(event: JobEvent): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.log(`[JobEvent] ${event.event_type}: ${event.message}`);
    return;
  }

  try {
    const { error } = await client.from('job_events').insert({
      job_id: event.job_id,
      event_type: event.event_type,
      message: event.message,
      metadata: event.metadata || {},
    });

    if (error) {
      console.error('[JobEvent] Failed to insert:', error);
    }
  } catch (err) {
    console.error('[JobEvent] Exception:', err);
  }
}

export interface JobProgress {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress_message?: string;
  percent_complete?: number;
  current_stage?: string;
  result_data?: Record<string, unknown>;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export async function updateJobProgress(progress: JobProgress): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    console.log(`[JobProgress] ${progress.status}: ${progress.progress_message}`);
    return;
  }

  try {
    const updateData: Record<string, unknown> = {
      status: progress.status,
      progress_message: progress.progress_message,
      percent_complete: progress.percent_complete,
      current_stage: progress.current_stage,
      result_data: progress.result_data,
      error_message: progress.error_message,
      updated_at: new Date().toISOString(),
    };

    if (progress.started_at) {
      updateData.started_at = progress.started_at;
    }
    if (progress.completed_at) {
      updateData.completed_at = progress.completed_at;
    }

    const { error } = await client
      .from('job_progress')
      .upsert({ job_id: progress.job_id, ...updateData }, { onConflict: 'job_id' });

    if (error) {
      console.error('[JobProgress] Failed to update:', error);
    }
  } catch (err) {
    console.error('[JobProgress] Exception:', err);
  }
}

export async function getJobProgress(jobId: string): Promise<JobProgress | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  try {
    const { data, error } = await client
      .from('job_progress')
      .select('*')
      .eq('job_id', jobId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as JobProgress;
  } catch {
    return null;
  }
}
