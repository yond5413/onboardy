'use client';

import { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import type { PodcastStyle } from './lib/script';

export default function Home() {
  const [githubUrl, setGithubUrl] = useState('');
  const [podcastStyle, setPodcastStyle] = useState<PodcastStyle>('overview');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('');
  const [markdown, setMarkdown] = useState<string>('');
  const [script, setScript] = useState<string>('');
  const [audioBase64, setAudioBase64] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'markdown' | 'script' | 'diagram'>('markdown');
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
    if (markdown && mermaidRef.current) {
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
  }, [markdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setJobStatus('queued');
    setMarkdown('');
    setScript('');
    setAudioBase64('');

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
        const data = await response.json();

        setJobStatus(data.status);

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
            <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setActiveTab('markdown')}
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === 'markdown'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                System Design Doc
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
                onClick={() => setActiveTab('diagram')}
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === 'diagram'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                Architecture Diagram
              </button>
            </div>

            {/* Tab Content */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
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

              {activeTab === 'diagram' && (
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-4 text-black dark:text-white">
                    Architecture Diagram
                  </h2>
                  {markdown.includes('```mermaid') ? (
                    <div ref={mermaidRef} className="flex justify-center overflow-x-auto" />
                  ) : (
                    <p className="text-zinc-600 dark:text-zinc-400">
                      No Mermaid diagram found in the system design document.
                    </p>
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
