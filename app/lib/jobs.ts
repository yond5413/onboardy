import { AnalysisJob } from './types';

// Use global to persist across module reloads in dev mode
declare global {
  var __jobStore: Map<string, AnalysisJob> | undefined;
}

const jobs = globalThis.__jobStore ?? new Map<string, AnalysisJob>();
globalThis.__jobStore = jobs;

class JobStore {
  create(job: AnalysisJob): void {
    jobs.set(job.id, job);
  }

  get(id: string): AnalysisJob | undefined {
    return jobs.get(id);
  }

  update(id: string, updates: Partial<AnalysisJob>): void {
    const job = jobs.get(id);
    if (job) {
      Object.assign(job, updates);
    }
  }

  delete(id: string): void {
    jobs.delete(id);
  }

  getAll(): AnalysisJob[] {
    return Array.from(jobs.values());
  }
}

export const jobStore = new JobStore();
