-- Migration: Add job_events table for background job progress tracking
-- This enables the Blaxel agent to write progress updates that Vercel can poll

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- JOB EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.job_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'started', 'progress', 'thinking', 'tool_use', 
    'stage_start', 'stage_complete', 'stage_failed',
    'complete', 'error'
  )),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient polling
CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON public.job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_created_at ON public.job_events(created_at DESC);

-- Enable RLS
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for job_events
CREATE POLICY "Users can view events for their jobs"
  ON public.job_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = job_events.job_id 
    AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Service role can insert job events"
  ON public.job_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- JOB PROGRESS TABLE (for quick status checks)
-- ============================================
CREATE TABLE IF NOT EXISTS public.job_progress (
  job_id UUID PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  progress_message TEXT,
  percent_complete INTEGER DEFAULT 0,
  current_stage TEXT,
  result_data JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_job_progress_job_id ON public.job_progress(job_id);

-- Enable RLS
ALTER TABLE public.job_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view progress for their jobs"
  ON public.job_progress FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = job_progress.job_id 
    AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can update progress for their jobs"
  ON public.job_progress FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = job_progress.job_id 
    AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Service role can insert/update job progress"
  ON public.job_progress FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_job_progress_updated_at ON public.job_progress;
CREATE TRIGGER update_job_progress_updated_at
  BEFORE UPDATE ON public.job_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
