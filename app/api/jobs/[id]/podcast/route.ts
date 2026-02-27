import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { jobStore } from '@/app/lib/jobs';
import { generatePodcastScript, type PodcastContentStyle, type PodcastSettings } from '@/app/lib/script';
import { generateTTS } from '@/app/lib/elevenlabs';

function getRepoName(githubUrl: string): string {
  const match = githubUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
  return match ? match[1] : 'repository';
}

export async function GET(
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
    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version');

    // Verify job ownership
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('user_id')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // If version is specified, return that specific version
    if (version) {
      const { data: podcast, error } = await supabase
        .from('podcasts')
        .select('*')
        .eq('job_id', jobId)
        .eq('version', parseInt(version))
        .single();

      if (error || !podcast) {
        return NextResponse.json(
          { error: 'Podcast version not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(podcast);
    }

    // Otherwise, return all versions
    const { data: podcasts, error } = await supabase
      .from('podcasts')
      .select('id, version, settings, created_at')
      .eq('job_id', jobId)
      .order('version', { ascending: false });

    if (error) {
      console.error('Error fetching podcasts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch podcasts' },
        { status: 500 }
      );
    }

    return NextResponse.json({ podcasts: podcasts || [] });
  } catch (error) {
    console.error('Error in GET podcast:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
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

    const { podcastStyle, ...restSettings } = await request.json();
    const settings: PodcastSettings = {
      style: (podcastStyle as PodcastContentStyle) || job.podcast_style?.style || 'overview',
      duration: restSettings.duration || job.podcast_style?.duration || 'standard',
      tone: restSettings.tone || job.podcast_style?.tone || 'professional',
      audience: restSettings.audience || job.podcast_style?.audience || 'developer',
    };
    const style = settings.style;
    const repoName = getRepoName(job.github_url);

    console.log(`[${jobId}] Generating podcast with settings:`, settings);

    // Update status
    await supabase.from('jobs').update({ status: 'generating_podcast' }).eq('id', jobId);
    jobStore.update(jobId, { status: 'generating_podcast' });

    try {
      // Generate podcast script
      console.log(`[${jobId}] Generating podcast script...`);
      const script = await generatePodcastScript(job.markdown_content, style, repoName, settings);
      
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

      const audioDataUri = audioBase64 ? `data:audio/mpeg;base64,${audioBase64}` : null;

      // Get next version number
      const { data: versionData } = await supabase.rpc('get_next_podcast_version', { job_uuid: jobId });
      const version = versionData || 1;

      // Insert into podcasts table
      const { data: podcast, error: insertError } = await supabase
        .from('podcasts')
        .insert({
          job_id: jobId,
          script_content: script,
          audio_file_path: audioDataUri,
          settings: settings,
          version: version,
        })
        .select()
        .single();

      if (insertError) {
        console.error(`[${jobId}] Failed to save podcast:`, insertError);
        throw new Error('Failed to save podcast');
      }

      // Update jobs table with latest version (for backward compatibility)
      await supabase.from('jobs').update({
        status: 'completed',
        script_content: script,
        audio_file_path: audioDataUri,
      }).eq('id', jobId);

      // Update in-memory store
      jobStore.update(jobId, { 
        status: 'completed',
        script,
        audioBase64: audioBase64 || undefined,
      });

      console.log(`[${jobId}] Podcast version ${version} generation completed successfully`);

      return NextResponse.json({
        success: true,
        script,
        audioBase64: audioBase64 || undefined,
        version,
        podcastId: podcast.id,
      });

    } catch (error) {
      console.error(`[${jobId}] Podcast generation failed:`, error);
      
      // Revert to completed status without podcast
      await supabase.from('jobs').update({
        status: 'completed',
        error_message: error instanceof Error ? error.message : 'Podcast generation failed',
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
