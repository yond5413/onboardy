'use client';

import { useState, useEffect, useCallback } from 'react';

interface FileNode {
  name: string;
  type: 'file' | 'directory';
}

interface SandboxExplorerProps {
  jobId: string;
}

interface FileContent {
  path: string;
  content: string;
  error?: string;
}

export function SandboxExplorer({ jobId }: SandboxExplorerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  const [files, setFiles] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState('/repo');
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [searchPattern, setSearchPattern] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/explore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', params: { path } }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch files');
      }
      
      const data = await response.json();
      setFiles(data.data?.entries || []);
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch files');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const readFile = useCallback(async (filePath: string) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/explore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', params: { path: filePath } }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to read file');
      }
      
      const data = await response.json();
      setFileContent({
        path: data.data?.path || filePath,
        content: data.data?.content || '',
        error: data.data?.error,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
      setFileContent(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const searchFiles = useCallback(async (pattern: string) => {
    if (!pattern.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/explore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'grep', 
          params: { content: pattern, path: '/repo' } 
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to search files');
      }
      
      const data = await response.json();
      setSearchResults(data.data?.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search files');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (files.length === 0) {
      fetchFiles('/repo');
    }
  }, [files.length, fetchFiles]);

  const handleNodeClick = (node: FileNode) => {
    setFileContent(null);
    if (node.type === 'directory') {
      fetchFiles(`${currentPath}/${node.name}`);
    } else {
      readFile(`${currentPath}/${node.name}`);
    }
  };

  const navigateUp = () => {
    if (currentPath === '/repo') return;
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/repo';
    fetchFiles(parentPath);
  };

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-sm flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading...
        </div>
      )}

      <div className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={navigateUp}
              disabled={currentPath === '/repo'}
              className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded disabled:opacity-30"
            >
              ←
            </button>
            <span className="font-mono text-zinc-600 dark:text-zinc-400 text-xs">
              {currentPath}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchPattern}
              onChange={(e) => setSearchPattern(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchFiles(searchPattern)}
              placeholder="Search in files..."
              className="px-3 py-1 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
            />
            <button
              onClick={() => searchFiles(searchPattern)}
              className="px-3 py-1 bg-zinc-600 text-white text-sm rounded hover:bg-zinc-700"
            >
              Search
            </button>
          </div>
        </div>

        {searchResults.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
                Files containing &quot;{searchPattern}&quot; ({searchResults.length})
              </h4>
              <button
                onClick={() => setSearchResults([])}
                className="text-xs text-yellow-600 dark:text-yellow-500 hover:underline"
              >
                Clear
              </button>
            </div>
            <ul className="space-y-1 max-h-32 overflow-y-auto text-xs">
              {searchResults.slice(0, 20).map((result, idx) => (
                <li key={idx} className="font-mono text-yellow-700 dark:text-yellow-300">
                  {result}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border border-zinc-200 dark:border-zinc-700 rounded divide-y divide-zinc-200 dark:divide-zinc-700">
          {files.length === 0 && !loading ? (
            <div className="p-4 text-center text-zinc-500 dark:text-zinc-400 text-sm">
              No files found
            </div>
          ) : (
            files.map((node, idx) => (
              <button
                key={idx}
                onClick={() => handleNodeClick(node)}
                className="w-full px-4 py-2 flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                {node.type === 'directory' ? (
                  <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-zinc-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="text-sm text-zinc-700 dark:text-zinc-300 font-mono">
                  {node.name}
                </span>
              </button>
            ))
          )}
        </div>

        {fileContent && (
          <div className="border border-zinc-200 dark:border-zinc-700 rounded overflow-hidden">
            <div className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 flex justify-between items-center">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 font-mono">
                {fileContent.path}
              </span>
              <button
                onClick={() => setFileContent(null)}
                className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-x-auto max-h-96">
              {fileContent.error ? (
                <p className="text-red-600 dark:text-red-400 text-sm">{fileContent.error}</p>
              ) : (
                <pre className="text-xs text-zinc-700 dark:text-zinc-300 font-mono whitespace-pre-wrap">
                  {fileContent.content}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
