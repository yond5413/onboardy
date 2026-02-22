import type { StageName, StageProgress } from './types';

export interface JobEvent {
  id: string;
  jobId: string;
  type: 'progress' | 'status' | 'complete' | 'error' | 'thinking' | 'tool_use' | 'stage_start' | 'stage_complete' | 'stage_failed' | 'stage_progress' | 'stage_skipped';
  message: string;
  timestamp: number;
  stage?: StageName;
  progress?: number;
  itemProgress?: StageProgress;
  durationMs?: number;
  error?: string;
  skipReason?: string;
}

const MAX_BUFFER_SIZE = 100;

declare global {
  var __jobEventBuffers: Map<string, JobEvent[]> | undefined;
  var __jobEventListeners: Map<string, Set<(event: JobEvent) => void>> | undefined;
}

const eventBuffers: Map<string, JobEvent[]> =
  globalThis.__jobEventBuffers ?? (globalThis.__jobEventBuffers = new Map());
const listeners: Map<string, Set<(event: JobEvent) => void>> =
  globalThis.__jobEventListeners ?? (globalThis.__jobEventListeners = new Map());

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
  options?: {
    stage?: StageName;
    progress?: number;
    itemProgress?: StageProgress;
    durationMs?: number;
    error?: string;
    skipReason?: string;
  }
): void {
  const event: JobEvent = {
    id: generateEventId(),
    jobId,
    type,
    message,
    timestamp: Date.now(),
    ...options,
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
  emitProgress: (jobId: string, message: string) => 
    emitJobEvent(jobId, 'progress', message),
  emitThinking: (jobId: string, message: string) => 
    emitJobEvent(jobId, 'thinking', message),
  emitToolUse: (jobId: string, toolName: string, input?: string) => 
    emitJobEvent(jobId, 'tool_use', `[Tool: ${toolName}]${input ? ` - ${input.substring(0, 100)}` : ''}`),
  emitComplete: (jobId: string) => 
    emitJobEvent(jobId, 'complete', 'Analysis complete!'),
  emitError: (jobId: string, error: string) => 
    emitJobEvent(jobId, 'error', error, { error }),
  
  emitStageStart: (jobId: string, stage: StageName, message: string) => 
    emitJobEvent(jobId, 'stage_start', message, { stage }),
  
  emitStageComplete: (jobId: string, stage: StageName, message: string, durationMs: number) => 
    emitJobEvent(jobId, 'stage_complete', message, { stage, durationMs }),
  
  emitStageFailed: (jobId: string, stage: StageName, message: string, error?: string) => 
    emitJobEvent(jobId, 'stage_failed', message, { stage, error }),
  
  emitStageProgress: (jobId: string, stage: StageName, message: string, itemProgress: StageProgress) => 
    emitJobEvent(jobId, 'stage_progress', message, { stage, itemProgress }),
  
  emitStageSkipped: (jobId: string, stage: StageName, reason: string) => 
    emitJobEvent(jobId, 'stage_skipped', `Skipped: ${reason}`, { stage, skipReason: reason }),
};
