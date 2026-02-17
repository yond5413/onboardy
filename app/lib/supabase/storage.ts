import { createClient } from './server';

const BUCKET_NAME = 'podcast-audio';

/**
 * Upload audio file to Supabase Storage
 * @param jobId - The job UUID
 * @param audioBase64 - Base64 encoded audio data
 * @returns Public URL of the uploaded file
 */
export async function uploadAudio(jobId: string, audioBase64: string): Promise<string> {
  const supabase = await createClient();
  
  // Convert base64 to buffer
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const filePath = `${jobId}/podcast.mp3`;
  
  const { data, error } = await supabase
    .storage
    .from(BUCKET_NAME)
    .upload(filePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });
  
  if (error) {
    console.error('Failed to upload audio:', error);
    throw new Error(`Failed to upload audio: ${error.message}`);
  }
  
  // Get public URL
  const { data: { publicUrl } } = supabase
    .storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);
  
  return publicUrl;
}

/**
 * Get audio file URL from Supabase Storage
 * @param jobId - The job UUID
 * @returns Public URL or null if not found
 */
export async function getAudioUrl(jobId: string): Promise<string | null> {
  const supabase = await createClient();
  const filePath = `${jobId}/podcast.mp3`;
  
  const { data, error } = await supabase
    .storage
    .from(BUCKET_NAME)
    .list(jobId);
  
  if (error || !data || data.length === 0) {
    return null;
  }
  
  const { data: { publicUrl } } = supabase
    .storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);
  
  return publicUrl;
}

/**
 * Delete audio file from Supabase Storage
 * @param jobId - The job UUID
 */
export async function deleteAudio(jobId: string): Promise<void> {
  const supabase = await createClient();
  const filePath = `${jobId}/podcast.mp3`;
  
  const { error } = await supabase
    .storage
    .from(BUCKET_NAME)
    .remove([filePath]);
  
  if (error) {
    console.error('Failed to delete audio:', error);
    throw new Error(`Failed to delete audio: ${error.message}`);
  }
}

/**
 * Check if audio file exists
 * @param jobId - The job UUID
 * @returns True if file exists
 */
export async function audioExists(jobId: string): Promise<boolean> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .storage
    .from(BUCKET_NAME)
    .list(jobId);
  
  if (error || !data) {
    return false;
  }
  
  return data.some(file => file.name === 'podcast.mp3');
}
