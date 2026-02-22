-- Migration 006: Add stage history and partial status for Progress UX v2
-- This enables granular progress tracking, ETA calculation, and partial failure handling

-- Add stage_history column to track individual stage progress and timing
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stage_history JSONB DEFAULT '{
  "clone": {"status": "pending"},
  "analysis": {"status": "pending"},
  "diagram": {"status": "pending"},
  "ownership": {"status": "pending"},
  "export": {"status": "pending"}
}'::jsonb;

-- Add partial_status to indicate overall job health
-- 'complete' = all stages succeeded
-- 'partial' = some stages succeeded, some failed/skipped
-- 'failed' = critical stage failed (clone or analysis)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS partial_status TEXT DEFAULT 'complete'
  CHECK (partial_status IN ('complete', 'partial', 'failed'));

-- Create index for querying by partial status (useful for analytics)
CREATE INDEX IF NOT EXISTS idx_jobs_partial_status ON jobs(partial_status);

-- Function to determine partial_status based on stage_history
CREATE OR REPLACE FUNCTION compute_partial_status(history JSONB)
RETURNS TEXT AS $$
DECLARE
  clone_status TEXT;
  analysis_status TEXT;
  failed_count INT;
  completed_count INT;
BEGIN
  clone_status := history->'clone'->>'status';
  analysis_status := history->'analysis'->>'status';
  
  -- If clone or analysis failed, the whole job is considered failed
  IF clone_status = 'failed' OR analysis_status = 'failed' THEN
    RETURN 'failed';
  END IF;
  
  -- Count failed and completed stages
  SELECT COUNT(*) INTO failed_count
  FROM jsonb_each(history)
  WHERE (value->>'status') = 'failed';
  
  SELECT COUNT(*) INTO completed_count
  FROM jsonb_each(history)
  WHERE (value->>'status') = 'completed';
  
  -- If any stage failed (but not clone/analysis), it's partial
  IF failed_count > 0 THEN
    RETURN 'partial';
  END IF;
  
  -- All stages completed successfully
  IF completed_count = 5 THEN
    RETURN 'complete';
  END IF;
  
  -- Default to complete (for in-progress jobs)
  RETURN 'complete';
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update partial_status when stage_history changes
CREATE OR REPLACE FUNCTION update_partial_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage_history IS DISTINCT FROM OLD.stage_history OR OLD.stage_history IS NULL THEN
    NEW.partial_status := compute_partial_status(NEW.stage_history);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any, then create new one
DROP TRIGGER IF EXISTS trg_update_partial_status ON jobs;
CREATE TRIGGER trg_update_partial_status
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_partial_status();

-- Initialize existing jobs
UPDATE jobs 
SET stage_history = '{
  "clone": {"status": "completed"},
  "analysis": {"status": "completed"},
  "diagram": {"status": "completed"},
  "ownership": {"status": "completed"},
  "export": {"status": "completed"}
}'::jsonb,
partial_status = 'complete'
WHERE status = 'completed';

UPDATE jobs 
SET stage_history = '{
  "clone": {"status": "failed"},
  "analysis": {"status": "failed"},
  "diagram": {"status": "failed"},
  "ownership": {"status": "failed"},
  "export": {"status": "failed"}
}'::jsonb,
partial_status = 'failed'
WHERE status = 'failed';

-- Add comment documenting the stage_history structure
COMMENT ON COLUMN jobs.stage_history IS 
'Stores progress and timing for each analysis stage. Structure:
{
  "clone": {
    "status": "pending|in_progress|completed|failed|skipped",
    "startedAt": "ISO timestamp",
    "completedAt": "ISO timestamp", 
    "durationMs": number,
    "error": "error message if failed",
    "skipReason": "reason if skipped",
    "progress": {"current": number, "total": number, "unit": "string"}
  },
  ...
}';
