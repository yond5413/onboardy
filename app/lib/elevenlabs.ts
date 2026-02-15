import { ElevenLabsClient } from 'elevenlabs';

// Default voice for single narrator
const NARRATOR_VOICE_ID = 'XB0fDUnXU5powFXDhCwa';  // Professional male

// Maximum characters per TTS request (ElevenLabs limit)
const MAX_TTS_CHARS = 4500;

// Lazy initialization of client
function getClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVEN_LABS_API_KEY environment variable is required');
  }
  return new ElevenLabsClient({ apiKey });
}

/**
 * Split text into chunks that fit within TTS limits
 */
function splitIntoChunks(text: string, maxChars: number = MAX_TTS_CHARS): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        // Single sentence is too long, split by words
        const words = sentence.split(' ');
        let wordChunk = '';
        for (const word of words) {
          if ((wordChunk + ' ' + word).length > maxChars) {
            if (wordChunk) chunks.push(wordChunk.trim());
            wordChunk = word;
          } else {
            wordChunk += (wordChunk ? ' ' : '') + word;
          }
        }
        if (wordChunk) currentChunk = wordChunk + ' ';
      }
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Generate TTS audio from script text
 * Returns base64 encoded audio data
 */
export async function generateTTS(script: string): Promise<string> {
  const client = getClient();
  
  // Split script into chunks if needed
  const chunks = splitIntoChunks(script);
  console.log(`[ElevenLabs] Generating TTS: ${script.length} chars, ${chunks.length} chunk(s)`);
  
  const audioBuffers: Buffer[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[ElevenLabs] Processing chunk ${i + 1}/${chunks.length}: ${chunk.length} chars`);
    
    const audioStream = await client.textToSpeech.convertAsStream(NARRATOR_VOICE_ID, {
      text: chunk,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    });
    
    // Collect stream chunks
    const chunks_data: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks_data.push(Buffer.from(chunk));
    }
    
    audioBuffers.push(Buffer.concat(chunks_data));
  }
  
  // Combine all chunks
  const combinedAudio = Buffer.concat(audioBuffers);
  const base64Audio = combinedAudio.toString('base64');
  
  console.log(`[ElevenLabs] Generated audio: ${base64Audio.length} base64 chars`);
  return base64Audio;
}

/**
 * Legacy function - kept for compatibility
 * Now redirects to TTS
 */
export async function generatePodcast(markdown: string): Promise<string> {
  console.warn('[ElevenLabs] generatePodcast() is deprecated, use generateTTS() instead');
  return generateTTS(markdown);
}
