-- Storage bucket and policies for podcast audio files
-- Run this after creating the 'podcast-audio' bucket in Supabase Storage

-- Note: Buckets must be created via Supabase Dashboard or Storage API
-- Go to Storage > New Bucket > Name: podcast-audio > Public: false

-- Policies for podcast-audio bucket

-- 1. Users can upload files to their own job folders
CREATE POLICY "Users can upload to own job folders"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'podcast-audio' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.user_id = auth.uid()
    )
  );

-- 2. Users can update their own files
CREATE POLICY "Users can update own files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'podcast-audio' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.user_id = auth.uid()
    )
  );

-- 3. Users can read their own files
CREATE POLICY "Users can read own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'podcast-audio' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.user_id = auth.uid()
    )
  );

-- 4. Users can read public job files
CREATE POLICY "Anyone can read public job files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'podcast-audio' AND
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.is_public = TRUE
    )
  );

-- 5. Users can delete their own files
CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'podcast-audio' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.user_id = auth.uid()
    )
  );
