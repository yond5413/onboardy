'use client';

import { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import type { PodcastStyle } from './lib/script';
import { AnalysisContextViewer } from './components/AnalysisContextViewer';
import { SandboxExplorer } from './components/SandboxExplorer';
import { ArchitectureDiagram } from './components/ArchitectureDiagram';

// Types for AnalysisContext
interface SourceFile {
  path: string;
  summary: string;
  imports?: string[];
  exports?: string[];
}

interface ConfigFile {
  content: string;
  keyDeps?: string[];
}

interface AnalysisContext {
  repositoryUrl: string;
  collectedAt: string;
  structure: {
    rootFiles: string[];
    directories: string[];
    entryPoints: string[];
  };
  configFiles: Record<string, ConfigFile>;
  sourceFiles: SourceFile[];
  patterns: {
    framework: string;
    architecture: string;
    keyModules: string[];
  };
  metadata?: {
    linesOfCode?: number;
    fileCount?: number;
    testFiles?: string[];
  };
}

interface ReactFlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: {
    label: string;
    description?: string;
    nodeType?: 'service' | 'database' | 'client' | 'external' | 'gateway';
    [key: string]: unknown;
  };
}

interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
}

interface ReactFlowData {
  architecture: {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
  };
  dataFlow: {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
  };
}

interface JobData {
  id: string;
  githubUrl: string;
  status: string;
  markdown?: string;
  script?: string;
  audioBase64?: string;
  error?: string;
  createdAt: string;
  analysisContext?: AnalysisContext;
  sandboxPaused?: boolean;
  reactFlowData?: ReactFlowData;
}

type TabType = 'markdown' | 'script' | 'diagram' | 'details' | 'explore';

export default function Home() {
  const [githubUrl, setGithubUrl] = useState('');
  const [podcastStyle, setPodcastStyle] = useState<PodcastStyle>('overview');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('');
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [script, setScript] = useState<string>('');
  const [audioBase64, setAudioBase64] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generatingPodcast, setGeneratingPodcast] = useState(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('markdown');
  const mermaidRef = useRef<HTMLDivElement>(null);

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
    });
  }, []);

  // Render mermaid diagrams when markdown changes
  useEffect(() => {
    if (markdown && mermaidRef.current && activeTab === 'diagram') {
      const diagramMatch = markdown.match(/```mermaid([\s\S]*?)```/);
      if (diagramMatch) {
        const diagramCode = diagramMatch[1].trim();
        mermaid.render('mermaid-diagram', diagramCode).then(({ svg }) => {
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML = svg;
          }
        }).catch((err) => {
          console.error('Mermaid render error:', err);
        });
      }
    }
  }, [markdown, activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setJobStatus('queued');
    setMarkdown('');
    setScript('');
    setAudioBase64('');
    setJobData(null);

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubUrl, podcastStyle }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create job');
      }

      const { jobId: id } = await response.json();
      setJobId(id);
      pollJobStatus(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const pollJobStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${id}`);
        const data: JobData = await response.json();

        setJobStatus(data.status);
        setJobData(data);

        if (data.status === 'completed') {
          clearInterval(interval);
          setLoading(false);
          setMarkdown(data.markdown || '');
          setScript(data.script || '');
          setAudioBase64(data.audioBase64 || '');
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setLoading(false);
          setError(data.error || 'Job failed');
          // Still show markdown if available
          if (data.markdown) {
            setMarkdown(data.markdown);
            setScript(data.script || '');
            setAudioBase64(data.audioBase64 || '');
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 3000);
  };

  const handleGeneratePodcast = async () => {
    if (!jobId) return;
    
    setGeneratingPodcast(true);
    setError('');
    setJobStatus('generating_podcast');

    try {
      const response = await fetch(`/api/jobs/${jobId}/podcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ podcastStyle }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate podcast');
      }

      setScript(data.script || '');
      setAudioBase64(data.audioBase64 || '');
      setJobStatus('completed');
      
      // Switch to script tab if podcast was generated
      if (data.script) {
        setActiveTab('script');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate podcast');
      setJobStatus('completed'); // Revert to completed status
    } finally {
      setGeneratingPodcast(false);
    }
  };

  const handleDeleteSandbox = async () => {
    if (!jobId) return;
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/sandbox`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete sandbox');
      }

      // Update job data to reflect sandbox deletion
      setJobData(prev => prev ? { ...prev, sandboxPaused: true } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sandbox');
    }
  };

  const handleDownloadAudio = () => {
    if (!audioBase64) return;
    
    const link = document.createElement('a');
    link.href = `data:audio/mpeg;base64,${audioBase64}`;
    link.download = `podcast-${jobId}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadMarkdown = () => {
    if (!markdown) return;
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `system-design-${jobId}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadScript = () => {
    if (!script) return;
    
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `podcast-script-${jobId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const canGeneratePodcast = jobStatus === 'completed' && markdown && !script && !generatingPodcast;
  const isGeneratingPodcast = jobStatus === 'generating_podcast' || generatingPodcast;

  // Check if analysis context is available
  const hasAnalysisContext = jobData?.analysisContext && 
    Object.keys(jobData.analysisContext).length > 0;

  // Check if this is an old job (no new fields)
  const isOldJob = jobData && !jobData.analysisContext && jobData.status === 'completed';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <main className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-black dark:text-white">
          Repo to Podcast
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          Analyze any GitHub repository and generate a system design podcast
        </p>

        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex flex-col gap-4">
            <input
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              className="flex-1 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-white"
              required
            />
            
            <div className="flex gap-4 items-center">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Podcast Style:</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="overview"
                  checked={podcastStyle === 'overview'}
                  onChange={(e) => setPodcastStyle(e.target.value as PodcastStyle)}
                  className="text-blue-600"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">High-Level Overview</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="technical"
                  checked={podcastStyle === 'technical'}
                  onChange={(e) => setPodcastStyle(e.target.value as PodcastStyle)}
                  className="text-blue-600"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">Technical Deep-Dive</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Analyze Repository'}
            </button>
          </div>
        </form>

        {error && (
          <div className="p-4 mb-6 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {jobId && (
          <div className="mb-6 p-4 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg">
            <p className="font-medium">Job ID: {jobId}</p>
            <p>Status: {jobStatus}</p>
            {isOldJob && (
              <p className="text-sm mt-2 text-yellow-600 dark:text-yellow-400">
                This is an older job. Some new features like detailed analysis context and sandbox exploration may not be available.
              </p>
            )}
          </div>
        )}

        {/* Generate Podcast Button - Only shows when analysis is complete but no podcast yet */}
        {canGeneratePodcast && (
          <div className="mb-6 p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-400 mb-2">
                  Analysis Complete!
                </h3>
                <p className="text-green-700 dark:text-green-300 text-sm">
                  Your system design document is ready. Generate a podcast to make it accessible.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex gap-4 items-center">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Podcast Style:</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="overview"
                      checked={podcastStyle === 'overview'}
                      onChange={(e) => setPodcastStyle(e.target.value as PodcastStyle)}
                      className="text-green-600"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">Overview</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="technical"
                      checked={podcastStyle === 'technical'}
                      onChange={(e) => setPodcastStyle(e.target.value as PodcastStyle)}
                      className="text-green-600"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">Technical</span>
                  </label>
                </div>
                <button
                  onClick={handleGeneratePodcast}
                  disabled={isGeneratingPodcast}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isGeneratingPodcast ? 'Generating Podcast...' : 'Generate Podcast'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isGeneratingPodcast && (
          <div className="mb-6 p-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg">
            <p className="font-medium">Generating podcast...</p>
            <p className="text-sm">This may take a minute. Using OpenRouter API.</p>
          </div>
        )}

        {(markdown || script || audioBase64) && (
          <div className="space-y-8">
            {/* Audio Player Section */}
            {audioBase64 && (
              <div className="p-6 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <h2 className="text-2xl font-semibold mb-4 text-black dark:text-white">
                  Podcast Audio
                </h2>
                <div className="flex flex-col gap-4">
                  <audio
                    controls
                    src={`data:audio/mpeg;base64,${audioBase64}`}
                    className="w-full"
                  />
                  <div className="flex gap-4">
                    <button
                      onClick={handleDownloadAudio}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 text-sm"
                    >
                      Download Audio
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setActiveTab('markdown')}
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === 'markdown'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                System Design
              </button>
              <button
                onClick={() => setActiveTab('diagram')}
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === 'diagram'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                Architecture
              </button>
              {script && (
                <button
                  onClick={() => setActiveTab('script')}
                  className={`px-4 py-2 font-medium text-sm ${
                    activeTab === 'script'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  Podcast Script
                </button>
              )}
              <button
                onClick={() => setActiveTab('details')}
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === 'details'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab('explore')}
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === 'explore'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                Explore
              </button>
            </div>

            {/* Tab Content */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {/* System Design Tab */}
              {activeTab === 'markdown' && markdown && (
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-black dark:text-white">
                      System Design Document
                    </h2>
                    <button
                      onClick={handleDownloadMarkdown}
                      className="px-4 py-2 bg-zinc-600 text-white rounded-lg font-medium hover:bg-zinc-700 text-sm"
                    >
                      Download Markdown
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-800 dark:text-zinc-200 overflow-x-auto">
                    {markdown}
                  </pre>
                </div>
              )}

              {/* Architecture Tab */}
              {activeTab === 'diagram' && (
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-4 text-black dark:text-white">
                    Architecture Diagram
                  </h2>
                  {jobData?.reactFlowData?.architecture?.nodes && jobData.reactFlowData.architecture.nodes.length > 0 ? (
                    <div className="h-[600px] border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                      <ArchitectureDiagram 
                        nodes={jobData.reactFlowData.architecture.nodes}
                        edges={jobData.reactFlowData.architecture.edges}
                        onNodeClick={(node) => {
                          console.log('Selected node:', node.id, node.data);
                        }}
                      />
                    </div>
                  ) : markdown.includes('```mermaid') ? (
                    <div ref={mermaidRef} className="flex justify-center overflow-x-auto" />
                  ) : (
                    <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
                      <svg
                        className="mx-auto h-12 w-12 text-zinc-400 mb-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                      </svg>
                      <p>No architecture diagram available for this job.</p>
                      <p className="text-sm mt-2">
                        Run a new analysis to see interactive React Flow diagrams.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Podcast Script Tab */}
              {activeTab === 'script' && script && (
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-black dark:text-white">
                      Podcast Script
                    </h2>
                    <button
                      onClick={handleDownloadScript}
                      className="px-4 py-2 bg-zinc-600 text-white rounded-lg font-medium hover:bg-zinc-700 text-sm"
                    >
                      Download Script
                    </button>
                  </div>
                  <div className="prose dark:prose-invert max-w-none">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                      Style: {podcastStyle === 'technical' ? 'Technical Deep-Dive' : 'High-Level Overview'}
                    </p>
                    <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-800 dark:text-zinc-200">
                      {script}
                    </pre>
                  </div>
                </div>
              )}

              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-4 text-black dark:text-white">
                    Analysis Details
                  </h2>
                  {isOldJob ? (
                    <div className="text-center py-8">
                      <svg
                        className="mx-auto h-12 w-12 text-zinc-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">
                        Details Not Available
                      </h3>
                      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                        This job was created before the detailed analysis context feature was added. 
                        Run a new analysis to see detailed repository information including file structure, 
                        patterns, and source file summaries.
                      </p>
                    </div>
                  ) : hasAnalysisContext ? (
                    <AnalysisContextViewer 
                      context={jobData!.analysisContext!} 
                      maxSummaryLength={150}
                    />
                  ) : (
                    <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                      {jobStatus === 'completed' ? (
                        <p>Analysis context not available for this job.</p>
                      ) : (
                        <p>Analysis details will appear here once the job is complete.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Explore Tab */}
              {activeTab === 'explore' && (
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-black dark:text-white">
                      Sandbox Explorer
                    </h2>
                    {jobData?.sandboxPaused !== undefined && !jobData.sandboxPaused && (
                      <button
                        onClick={handleDeleteSandbox}
                        className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700"
                      >
                        Delete Sandbox
                      </button>
                    )}
                  </div>
                  {isOldJob ? (
                    <div className="text-center py-8">
                      <svg
                        className="mx-auto h-12 w-12 text-zinc-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">
                        Explorer Not Available
                      </h3>
                      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                        This job was created before the sandbox exploration feature was added. 
                        Run a new analysis to explore the repository files directly in the sandbox.
                      </p>
                    </div>
                  ) : jobId ? (
                    <SandboxExplorer
                      jobId={jobId}
                      sandboxPaused={jobData?.sandboxPaused || false}
                      onDeleteSandbox={handleDeleteSandbox}
                    />
                  ) : (
                    <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                      <p>Start an analysis to explore the repository sandbox.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
