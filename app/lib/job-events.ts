export interface JobEvent {
  id: string;
  jobId: string;
  type: 'progress' | 'status' | 'complete' | 'error' | 'thinking' | 'tool_use' | 'stage_start' | 'stage_complete' | 'stage_failed';
  message: string;
  timestamp: number;
  stage?: string;
  progress?: number;
}

const MAX_BUFFER_SIZE = 100;

const eventBuffers: Map<string, JobEvent[]> = new Map();
const listeners: Map<string, Set<(event: JobEvent) => void>> = new Map();

function generateEventId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function getOrCreateBuffer(jobId: string): JobEvent[] {
  if (!eventBuffers.has(jobId)) {
    eventBuffers.set(jobId, []);
  }
  return eventBuffers.get(jobId)!;
}

function getOrCreateListeners(jobId: string): Set<(event: JobEvent) => void> {
  if (!listeners.has(jobId)) {
    listeners.set(jobId, new Set());
  }
  return listeners.get(jobId)!;
}

export function emitJobEvent(
  jobId: string,
  type: JobEvent['type'],
  message: string,
  stage?: string,
  progress?: number
): void {
  const event: JobEvent = {
    id: generateEventId(),
    jobId,
    type,
    message,
    timestamp: Date.now(),
    stage,
    progress,
  };

  const buffer = getOrCreateBuffer(jobId);
  buffer.push(event);

  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.shift();
  }

  const jobListeners = getOrCreateListeners(jobId);
  for (const listener of jobListeners) {
    try {
      listener(event);
    } catch (error) {
      console.error(`Error in job event listener:`, error);
    }
  }
}

export function subscribeToJobEvents(
  jobId: string,
  callback: (event: JobEvent) => void
): () => void {
  const jobListeners = getOrCreateListeners(jobId);
  jobListeners.add(callback);

  return () => {
    jobListeners.delete(callback);
  };
}

export function getBufferedEvents(jobId: string): JobEvent[] {
  return getOrCreateBuffer(jobId).slice(-MAX_BUFFER_SIZE);
}

export function clearJobEvents(jobId: string): void {
  eventBuffers.delete(jobId);
  listeners.delete(jobId);
}

export const JobEvents = {
  emitProgress: (jobId: string, message: string) => emitJobEvent(jobId, 'progress', message),
  emitThinking: (jobId: string, message: string) => emitJobEvent(jobId, 'thinking', message),
  emitToolUse: (jobId: string, toolName: string, input?: string) => 
    emitJobEvent(jobId, 'tool_use', `[Tool: ${toolName}]${input ? ` - ${input.substring(0, 100)}` : ''}`),
  emitComplete: (jobId: string) => emitJobEvent(jobId, 'complete', 'Analysis complete!'),
  emitError: (jobId: string, error: string) => emitJobEvent(jobId, 'error', error),
  emitStageStart: (jobId: string, stage: string, message: string) => 
    emitJobEvent(jobId, 'stage_start', message, stage),
  emitStageComplete: (jobId: string, stage: string, message: string) => 
    emitJobEvent(jobId, 'stage_complete', message, stage),
  emitStageFailed: (jobId: string, stage: string, message: string) => 
    emitJobEvent(jobId, 'stage_failed', message, stage),
};
