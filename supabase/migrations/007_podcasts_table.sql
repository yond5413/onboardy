-- Migration to add podcasts table for version history
-- Allows users to generate multiple podcast versions with different settings

-- ============================================
-- PODCASTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.podcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  script_content TEXT NOT NULL,
  audio_file_path TEXT,
  settings JSONB,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique version numbers per job
  CONSTRAINT unique_job_version UNIQUE (job_id, version)
);

-- Indexes for podcasts
CREATE INDEX IF NOT EXISTS idx_podcasts_job_id ON public.podcasts(job_id);
CREATE INDEX IF NOT EXISTS idx_podcasts_job_version ON public.podcasts(job_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_podcasts_created_at ON public.podcasts(created_at DESC);

-- Enable RLS
ALTER TABLE public.podcasts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for podcasts
CREATE POLICY "Users can view podcasts for their jobs"
  ON public.podcasts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = podcasts.job_id 
    AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can create podcasts for their jobs"
  ON public.podcasts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = podcasts.job_id 
    AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete podcasts for their jobs"
  ON public.podcasts FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = podcasts.job_id 
    AND jobs.user_id = auth.uid()
  ));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get the next version number for a job
CREATE OR REPLACE FUNCTION public.get_next_podcast_version(job_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1
  INTO next_version
  FROM public.podcasts
  WHERE job_id = job_uuid;
  
  RETURN next_version;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_next_podcast_version TO authenticated;
