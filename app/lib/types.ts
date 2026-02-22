import type { PodcastStyle } from './script';
import type { AnalysisMetrics } from './cost-tracker';

export type JobStatus = 'queued' | 'processing' | 'cloning' | 'analyzing' | 'generating' | 'completed' | 'failed' | 'destroyed' | 'generating_podcast';

export type StageName = 'clone' | 'analysis' | 'diagram' | 'ownership' | 'export';

export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface StageProgress {
  current: number;
  total: number;
  unit: string;
}

export interface StageInfo {
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  skipReason?: string;
  progress?: StageProgress;
}

export type StageHistory = Record<StageName, StageInfo>;

export type PartialStatus = 'complete' | 'partial' | 'failed';

export interface StageDependencies {
  stage: StageName;
  dependsOn: StageName[];
}

export const STAGE_DEPENDENCIES: StageDependencies[] = [
  { stage: 'clone', dependsOn: [] },
  { stage: 'analysis', dependsOn: ['clone'] },
  { stage: 'diagram', dependsOn: ['analysis'] },
  { stage: 'ownership', dependsOn: ['diagram'] },
  { stage: 'export', dependsOn: ['analysis'] },
];

export const STAGE_CONFIG: Record<StageName, { label: string; weight: number; description: string }> = {
  clone: { label: 'Cloning', weight: 10, description: 'Cloning repository to sandbox' },
  analysis: { label: 'Analyzing', weight: 40, description: 'Analyzing codebase structure and logic' },
  diagram: { label: 'Generating Diagram', weight: 25, description: 'Creating architecture diagram' },
  ownership: { label: 'Finding Owners', weight: 15, description: 'Analyzing git history for ownership' },
  export: { label: 'Exporting', weight: 10, description: 'Exporting analysis outputs' },
};

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
  primaryLanguage?: string;
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
  filePath?: string;
  relatedEdges: string[];
  neighborNodes: string[];
  relationshipDetails?: string[];
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
