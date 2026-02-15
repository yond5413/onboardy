'use client';

import { useState } from 'react';

export default function Home() {
  const [githubUrl, setGithubUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('');
  const [markdown, setMarkdown] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setJobStatus('queued');

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubUrl }),
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
          setAudioUrl(data.audioUrl || '');
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setLoading(false);
          setError(data.error || 'Job failed');
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-black dark:text-white">
          Repo to Podcast
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          Analyze any GitHub repository and generate a system design podcast
        </p>

        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-4">
            <input
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              className="flex-1 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-white"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Analyze'}
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

        {audioUrl && (
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-black dark:text-white">
              System Design Podcast
            </h2>
            <audio
              controls
              src={audioUrl}
              className="w-full"
            />
          </div>
        )}

        {markdown && (
          <div className="prose dark:prose-invert max-w-none">
            <h2 className="text-2xl font-semibold mb-4 text-black dark:text-white">
              System Design Document
            </h2>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-800 dark:text-zinc-200">
                {markdown}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
