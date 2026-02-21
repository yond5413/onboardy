import type { PodcastStyle } from './script';
import type { AnalysisMetrics } from './cost-tracker';

export type JobStatus = 'queued' | 'processing' | 'cloning' | 'analyzing' | 'generating' | 'completed' | 'failed' | 'destroyed' | 'generating_podcast';

// React Flow node and edge types for diagram data
export interface ReactFlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  style?: Record<string, unknown>;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  style?: Record<string, unknown>;
}

export interface ReactFlowData {
  architecture: {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
  };
  dataFlow: {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
  };
}

// Configuration file entry in analysis context
export interface ConfigFileEntry {
  content: string;
  keyDeps?: string[];
}

// Source file entry in analysis context
export interface SourceFileEntry {
  path: string;
  summary: string;
  imports?: string[];
  exports?: string[];
}

// Repository structure information
export interface RepoStructure {
  rootFiles: string[];
  directories: string[];
  entryPoints: string[];
}

// Identified patterns in the codebase
export interface CodePatterns {
  framework: string;
  architecture: string;
  keyModules: string[];
}

// Metadata about the repository
export interface RepoMetadata {
  linesOfCode?: number;
  fileCount?: number;
  testFiles?: string[];
}

// Main analysis context interface
export interface AnalysisContext {
  repositoryUrl: string;
  collectedAt: string;
  structure: RepoStructure;
  configFiles: Record<string, ConfigFileEntry>;
  sourceFiles: SourceFileEntry[];
  patterns: CodePatterns;
  metadata?: RepoMetadata;
}

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
  // New fields for Agent A deliverables
  analysisContext?: AnalysisContext;
  sandboxPaused?: boolean;
  reactFlowData?: ReactFlowData;
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

export interface GraphContext {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  relatedEdges: string[];
  neighborNodes: string[];
  action?: 'explain' | 'trace' | 'debug' | 'files';
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
