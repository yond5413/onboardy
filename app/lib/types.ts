import type { PodcastStyle } from './script';
import type { AnalysisMetrics } from './cost-tracker';

export type JobStatus = 'queued' | 'cloning' | 'analyzing' | 'generating' | 'completed' | 'failed' | 'destroyed';

export interface AnalysisJob {
  id: string;
  githubUrl: string;
  status: JobStatus;
  sandboxName: string;
  podcastStyle?: PodcastStyle;
  markdown?: string;
  script?: string;
  audioBase64?: string;
  error?: string;
  createdAt: Date;
  analysisMetrics?: AnalysisMetrics;
}

export interface RepoContext {
  structure: string;
  keyFiles: {
    path: string;
    content: string;
  }[];
  patterns: {
    routes: string[];
    models: string[];
    controllers: string[];
    configs: string[];
  };
}

export interface SystemDesign {
  overview: string;
  techStack: string[];
  architecture: string;
  components: {
    name: string;
    description: string;
    responsibilities: string[];
  }[];
  dataFlow: string;
  mermaidDiagrams: {
    architecture: string;
    dataFlow: string;
    componentInteraction: string;
  };
}
