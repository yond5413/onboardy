import { NextResponse } from 'next/server';
import { jobStore } from '@/app/lib/jobs';
import { generatePodcastScript, type PodcastStyle } from '@/app/lib/script';
import { generateTTS } from '@/app/lib/elevenlabs';

// Extract repo name from GitHub URL
function getRepoName(githubUrl: string): string {
  const match = githubUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
  return match ? match[1] : 'repository';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const job = jobStore.get(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Only allow podcast generation for completed jobs with markdown
    if (job.status !== 'completed' || !job.markdown) {
      return NextResponse.json(
        { error: 'Job must be completed with analysis before generating podcast' },
        { status: 400 }
      );
    }

    const { podcastStyle } = await request.json();
    const style = (podcastStyle as PodcastStyle) || job.podcastStyle || 'overview';
    const repoName = getRepoName(job.githubUrl);

    console.log(`[${jobId}] Generating podcast with style: ${style}`);

    // Update status to show podcast generation in progress
    jobStore.update(jobId, { 
      status: 'generating_podcast',
    });

    try {
      // Generate podcast script
      console.log(`[${jobId}] Generating podcast script...`);
      const script = await generatePodcastScript(job.markdown, style, repoName);
      
      if (!script) {
        throw new Error('Failed to generate podcast script');
      }

      console.log(`[${jobId}] Script generated: ${script.length} chars`);
      jobStore.update(jobId, { script });

      // Generate TTS audio from script
      console.log(`[${jobId}] Generating TTS audio...`);
      const audioBase64 = await generateTTS(script);
      
      if (audioBase64) {
        console.log(`[${jobId}] TTS audio generated: ${audioBase64.length} base64 chars`);
        jobStore.update(jobId, { audioBase64 });
      }

      // Mark as completed with podcast
      jobStore.update(jobId, { 
        status: 'completed',
        script,
        audioBase64: audioBase64 || undefined,
      });

      console.log(`[${jobId}] Podcast generation completed successfully`);

      return NextResponse.json({
        success: true,
        script,
        audioBase64: audioBase64 || undefined,
      });

    } catch (error) {
      console.error(`[${jobId}] Podcast generation failed:`, error);
      
      // Revert to completed status without podcast
      jobStore.update(jobId, { 
        status: 'completed',
        error: error instanceof Error ? error.message : 'Podcast generation failed',
      });

      return NextResponse.json(
        { 
          error: 'Podcast generation failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in podcast generation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
