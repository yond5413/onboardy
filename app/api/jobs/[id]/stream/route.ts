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
        let streamClosed = false;
        let keepAlive: ReturnType<typeof setInterval> | null = null;
        let unsubscribe: (() => void) | null = null;

        const cleanup = () => {
          if (keepAlive) {
            clearInterval(keepAlive);
            keepAlive = null;
          }
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        };

        const sendEvent = (event: JobEvent) => {
          if (streamClosed) return;

          const data = `data: ${JSON.stringify(event)}\n\n`;
          try {
            controller.enqueue(encoder.encode(data));

            // Close stream immediately when job completes or errors
            if (event.type === 'complete' || event.type === 'error') {
              streamClosed = true;
              cleanup();
              // Small delay to ensure event flushes before closing
              setTimeout(() => {
                try {
                  controller.close();
                } catch (e) {
                  console.error('Error closing stream:', e);
                }
              }, 50);
            }
          } catch (error) {
            console.error('Error sending event:', error);
            if (!streamClosed) {
              streamClosed = true;
              cleanup();
              try {
                controller.close();
              } catch (e) {
                console.error('Error closing stream after error:', e);
              }
            }
          }
        };

        // Replay buffered events first
        const bufferedEvents = getBufferedEvents(jobId);
        for (const event of bufferedEvents) {
          sendEvent(event);
        }

        // Only set up subscription and keepalive if stream wasn't closed by buffered events
        if (!streamClosed) {
          unsubscribe = subscribeToJobEvents(jobId, sendEvent);

          keepAlive = setInterval(() => {
            if (streamClosed) {
              cleanup();
              return;
            }
            try {
              controller.enqueue(encoder.encode(': keepalive\n\n'));
            } catch {
              cleanup();
            }
          }, 15000);
        }

        request.signal.addEventListener('abort', () => {
          streamClosed = true;
          cleanup();
          try {
            controller.close();
          } catch {
            // Stream already closed
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
