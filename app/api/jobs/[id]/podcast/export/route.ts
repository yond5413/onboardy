import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import JSZip from 'jszip';

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
    const type = searchParams.get('type') || 'script';
    const version = searchParams.get('version');

    // Verify job ownership
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('user_id, github_url')
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

    // Get podcast data
    let query = supabase
      .from('podcasts')
      .select('*')
      .eq('job_id', jobId);

    if (version) {
      query = query.eq('version', parseInt(version));
    } else {
      query = query.order('version', { ascending: false }).limit(1);
    }

    const { data: podcast, error: podcastError } = await query.single();

    if (podcastError || !podcast) {
      return NextResponse.json(
        { error: 'Podcast not found' },
        { status: 404 }
      );
    }

    const repoName = job.github_url.match(/github\.com\/([^\/]+\/[^\/]+)/)?.[1] || 'repository';
    const sanitizedRepoName = repoName.replace(/[^a-zA-Z0-9-_]/g, '_');

    // Handle different export types
    if (type === 'script') {
      return new NextResponse(podcast.script_content, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="podcast-script-${sanitizedRepoName}-v${podcast.version}.txt"`,
        },
      });
    }

    if (type === 'audio') {
      if (!podcast.audio_file_path) {
        return NextResponse.json(
          { error: 'Audio not available for this podcast' },
          { status: 404 }
        );
      }

      // Extract base64 from data URI
      const base64Match = podcast.audio_file_path.match(/^data:audio\/mpeg;base64,(.+)$/);
      if (!base64Match) {
        return NextResponse.json(
          { error: 'Invalid audio format' },
          { status: 500 }
        );
      }

      const audioBuffer = Buffer.from(base64Match[1], 'base64');

      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="podcast-audio-${sanitizedRepoName}-v${podcast.version}.mp3"`,
        },
      });
    }

    if (type === 'both') {
      const zip = new JSZip();

      // Add script to zip
      zip.file(`podcast-script-v${podcast.version}.txt`, podcast.script_content);

      // Add audio to zip if available
      if (podcast.audio_file_path) {
        const base64Match = podcast.audio_file_path.match(/^data:audio\/mpeg;base64,(.+)$/);
        if (base64Match) {
          zip.file(`podcast-audio-v${podcast.version}.mp3`, base64Match[1], { base64: true });
        }
      }

      // Add metadata file
      const metadata = {
        repository: repoName,
        version: podcast.version,
        created_at: podcast.created_at,
        settings: podcast.settings,
      };
      zip.file('metadata.json', JSON.stringify(metadata, null, 2));

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      return new NextResponse(zipBuffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="podcast-${sanitizedRepoName}-v${podcast.version}.zip"`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid export type. Use: script, audio, or both' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error in podcast export:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
