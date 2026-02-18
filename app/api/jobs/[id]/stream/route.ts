import { getBufferedEvents, subscribeToJobEvents, type JobEvent } from '@/app/lib/job-events';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

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

      request.signal.addEventListener('abort', () => {
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
}
