import { ElevenLabsClient } from 'elevenlabs';

// Default voices for conversation mode
const HOST_VOICE_ID = 'XB0fDUnXU5powFXDhCwa';  // Professional male
const GUEST_VOICE_ID = 'Xb7hH8MSUJpSbSDYk0k2'; // Professional female

// Lazy initialization of client
function getClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVEN_LABS_API_KEY environment variable is required');
  }
  return new ElevenLabsClient({ apiKey });
}

export async function generatePodcast(markdown: string): Promise<string> {
  const client = getClient();

  const response = await client.studio.createPodcast({
    model_id: 'eleven_multilingual_v2',
    mode: {
      type: 'conversation',
      conversation: {
        host_voice_id: HOST_VOICE_ID,
        guest_voice_id: GUEST_VOICE_ID,
      },
    },
    source: {
      text: markdown,
    },
  });

  // Return the audio URL
  return (response as { audioUrl?: string; audio_url?: string }).audioUrl || 
         (response as { audioUrl?: string; audio_url?: string }).audio_url || '';
}
