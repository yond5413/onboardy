import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = await createClient();
    const { token } = await params;

    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, github_url, status, markdown_content, analysis_context, react_flow_data, created_at')
      .eq('share_token', token)
      .eq('is_public', true)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: 'Shared analysis not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: job.id,
      github_url: job.github_url,
      status: job.status,
      markdown_content: job.markdown_content,
      analysis_context: job.analysis_context,
      react_flow_data: job.react_flow_data,
      created_at: job.created_at,
    });
  } catch (error) {
    console.error('Failed to get shared job:', error);
    return NextResponse.json(
      { error: 'Failed to get shared analysis' },
      { status: 500 }
    );
  }
}
