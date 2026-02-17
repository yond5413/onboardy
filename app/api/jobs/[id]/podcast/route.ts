import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { jobStore } from '@/app/lib/jobs';
import { generatePodcastScript, type PodcastStyle } from '@/app/lib/script';
import { generateTTS } from '@/app/lib/elevenlabs';

function getRepoName(githubUrl: string): string {
  const match = githubUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
  return match ? match[1] : 'repository';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: jobId } = await params;

    // Fetch job from Supabase
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('*, podcast_style')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (job.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only allow podcast generation for completed jobs with markdown
    if (job.status !== 'completed' || !job.markdown_content) {
      return NextResponse.json(
        { error: 'Job must be completed with analysis before generating podcast' },
        { status: 400 }
      );
    }

    const { podcastStyle } = await request.json();
    const style = (podcastStyle as PodcastStyle) || job.podcast_style || 'overview';
    const repoName = getRepoName(job.github_url);

    console.log(`[${jobId}] Generating podcast with style: ${style}`);

    // Update status
    await supabase.from('jobs').update({ status: 'generating_podcast' }).eq('id', jobId);
    jobStore.update(jobId, { status: 'generating_podcast' });

    try {
      // Generate podcast script
      console.log(`[${jobId}] Generating podcast script...`);
      const script = await generatePodcastScript(job.markdown_content, style, repoName);
      
      if (!script) {
        throw new Error('Failed to generate podcast script');
      }

      console.log(`[${jobId}] Script generated: ${script.length} chars`);

      // Generate TTS audio from script
      console.log(`[${jobId}] Generating TTS audio...`);
      const audioBase64 = await generateTTS(script);
      
      if (audioBase64) {
        console.log(`[${jobId}] TTS audio generated: ${audioBase64.length} base64 chars`);
      }

      // Save to Supabase
      await supabase.from('jobs').update({
        status: 'completed',
        script_content: script,
        audio_file_path: audioBase64 ? `data:audio/mpeg;base64,${audioBase64}` : null,
      }).eq('id', jobId);

      // Update in-memory store
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
      await supabase.from('jobs').update({
        status: 'completed',
        error: error instanceof Error ? error.message : 'Podcast generation failed',
      }).eq('id', jobId);

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
