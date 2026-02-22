-- Add layered markdown output columns to jobs table
-- Enables separation of content for different audiences:
-- - markdown_executive_summary: For non-technical stakeholders (PMs, Execs)
-- - markdown_technical_deep_dive: For experienced developers
-- - markdown_content: Full layered document (existing)

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS markdown_executive_summary TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS markdown_technical_deep_dive TEXT;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_jobs_has_executive_summary 
  ON public.jobs(id) 
  WHERE markdown_executive_summary IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_has_technical_deepdive 
  ON public.jobs(id) 
  WHERE markdown_technical_deep_dive IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.jobs.markdown_executive_summary IS 
  'Layer 1: Executive Summary for non-technical stakeholders (PMs, Execs) - ~2 min read';

COMMENT ON COLUMN public.jobs.markdown_technical_deep_dive IS 
  'Layer 3: Technical Deep Dive for experienced developers - ~20 min read';
