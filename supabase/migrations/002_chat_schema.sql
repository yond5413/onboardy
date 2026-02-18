-- Chat schema migration for job chats
-- Enables per-job chat functionality with Claude

-- ============================================
-- JOB CHATS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.job_chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  context_files TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job_chats
CREATE INDEX IF NOT EXISTS idx_job_chats_job_id ON public.job_chats(job_id);
CREATE INDEX IF NOT EXISTS idx_job_chats_created_at ON public.job_chats(created_at ASC);

-- Enable RLS
ALTER TABLE public.job_chats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for job_chats
CREATE POLICY "Users can view chat for their jobs"
  ON public.job_chats FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = job_chats.job_id 
    AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert chat for their jobs"
  ON public.job_chats FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = job_chats.job_id 
    AND jobs.user_id = auth.uid()
  ));

-- ============================================
-- STORAGE FOR ANALYSIS OUTPUTS
-- ============================================
-- Note: Create bucket via Supabase Dashboard or API:
-- Bucket name: analysis-outputs
-- Public: false (private, accessed via RLS)

-- Storage RLS policies (apply after creating bucket):
-- Users can only access their own job exports

-- ============================================
-- JOBS TABLE ADDITIONS
-- ============================================
-- Add export_paths column to jobs for S3 export tracking
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS export_paths JSONB DEFAULT '{}';

-- Update RLS policy for export_paths
-- (inherits from existing jobs RLS)
