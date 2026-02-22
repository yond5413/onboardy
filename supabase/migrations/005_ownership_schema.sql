-- Add ownership_data JSONB column to jobs table
-- Stores ownership analysis results including:
-- - globalOwners: Top contributors who can answer questions about the codebase
-- - componentOwners: Ownership by specific components (for future use)

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS ownership_data JSONB;

-- Create index for efficient queries on ownership data
CREATE INDEX IF NOT EXISTS idx_jobs_has_ownership_data 
  ON public.jobs(id) 
  WHERE ownership_data IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.jobs.ownership_data IS 
  'Ownership analysis data: global owners and component-level owners with confidence scores';
