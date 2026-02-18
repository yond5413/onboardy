import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { getBufferedEvents, subscribeToJobEvents, type JobEvent } from '@/app/lib/job-events';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    const { id: jobId } = await params;

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, user_id, status')
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

    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (event: JobEvent) => {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          try {
            controller.enqueue(encoder.encode(data));
          } catch (error) {
            console.error('Error sending event:', error);
          }
        };

        const bufferedEvents = getBufferedEvents(jobId);
        for (const event of bufferedEvents) {
          sendEvent(event);
        }

        const unsubscribe = subscribeToJobEvents(jobId, sendEvent);

        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch (error) {
            clearInterval(keepAlive);
          }
        }, 15000);

        request.signal.addEventListener('abort', () => {
          clearInterval(keepAlive);
          unsubscribe();
          try {
            controller.close();
          } catch (e) {
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('SSE stream error:', error);
    return NextResponse.json(
      { error: 'Failed to create stream' },
      { status: 500 }
    );
  }
}
