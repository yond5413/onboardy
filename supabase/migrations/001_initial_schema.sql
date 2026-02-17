-- Initial schema migration for Onboardy Supabase migration
-- Creates tables for jobs, sandboxes, profiles, and job_logs
-- Sets up RLS policies for security

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the function every time a user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- JOBS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  github_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'cloning', 'analyzing', 'generating', 
    'completed', 'failed', 'destroyed', 'generating_podcast'
  )),
  sandbox_name TEXT,
  podcast_style TEXT DEFAULT 'overview',
  
  -- Content storage
  markdown_content TEXT,
  script_content TEXT,
  audio_file_path TEXT,
  error_message TEXT,
  
  -- JSONB fields for complex data
  analysis_context JSONB,
  analysis_metrics JSONB,
  react_flow_data JSONB,
  
  -- Sharing features
  is_public BOOLEAN DEFAULT FALSE,
  share_token TEXT UNIQUE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_github_url CHECK (github_url LIKE 'https://github.com/%')
);

-- Indexes for jobs
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_share_token ON public.jobs(share_token) WHERE is_public = TRUE;

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for jobs
CREATE POLICY "Users can view own or public jobs"
  ON public.jobs FOR SELECT
  USING (auth.uid() = user_id OR is_public = TRUE);

CREATE POLICY "Users can create jobs"
  ON public.jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
  ON public.jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own jobs"
  ON public.jobs FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SANDBOXES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.sandboxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  blaxel_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('creating', 'active', 'paused', 'destroyed', 'error')),
  repo_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  destroyed_at TIMESTAMPTZ,
  error_message TEXT
);

-- Indexes for sandboxes
CREATE INDEX IF NOT EXISTS idx_sandboxes_job_id ON public.sandboxes(job_id);
CREATE INDEX IF NOT EXISTS idx_sandboxes_status ON public.sandboxes(status);

-- Enable RLS
ALTER TABLE public.sandboxes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sandboxes
CREATE POLICY "Users can view sandboxes for their jobs"
  ON public.sandboxes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = sandboxes.job_id 
    AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can create sandboxes for their jobs"
  ON public.sandboxes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = sandboxes.job_id 
    AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can update sandboxes for their jobs"
  ON public.sandboxes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = sandboxes.job_id 
    AND jobs.user_id = auth.uid()
  ));

-- ============================================
-- JOB LOGS TABLE (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS public.job_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job_logs
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON public.job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_created_at ON public.job_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.job_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for job_logs
CREATE POLICY "Users can view logs for their jobs"
  ON public.job_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = job_logs.job_id 
    AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can create logs for their jobs"
  ON public.job_logs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = job_logs.job_id 
    AND jobs.user_id = auth.uid()
  ));

-- ============================================
-- STORAGE SETUP
-- ============================================
-- Note: Storage buckets need to be created via Supabase Dashboard or API
-- Bucket name: podcast-audio
-- Public access: false (files accessed via signed URLs or RLS)

-- Storage RLS policies (apply after creating bucket):
-- Users can only upload to their own job folders
-- Users can only download their own files or public job files

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to generate share token
CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS TEXT AS $$
DECLARE
  token TEXT;
  exists_already BOOLEAN;
BEGIN
  LOOP
    -- Generate random 12-character token
    token := substring(md5(random()::text), 1, 12);
    
    -- Check if token already exists
    SELECT EXISTS(
      SELECT 1 FROM public.jobs WHERE share_token = token
    ) INTO exists_already;
    
    EXIT WHEN NOT exists_already;
  END LOOP;
  
  RETURN token;
END;
$$ LANGUAGE plpgsql;

-- Function to share a job (sets is_public and generates token)
CREATE OR REPLACE FUNCTION public.share_job(job_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  token TEXT;
BEGIN
  -- Generate new token
  token := public.generate_share_token();
  
  -- Update job
  UPDATE public.jobs
  SET is_public = TRUE,
      share_token = token,
      updated_at = NOW()
  WHERE id = job_uuid
    AND user_id = auth.uid();
  
  RETURN token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unshare a job
CREATE OR REPLACE FUNCTION public.unshare_job(job_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.jobs
  SET is_public = FALSE,
      share_token = NULL,
      updated_at = NOW()
  WHERE id = job_uuid
    AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
