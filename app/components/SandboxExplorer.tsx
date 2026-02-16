'use client';

import { useState, useEffect, useCallback } from 'react';

type ExplorerMode = 'chat' | 'files';
type FileAction = 'read' | 'glob' | 'grep';

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SandboxExplorerProps {
  jobId: string;
  sandboxPaused: boolean;
  onDeleteSandbox: () => void;
}

interface FileContent {
  path: string;
  content: string;
  error?: string;
}

export function SandboxExplorer({ jobId, sandboxPaused, onDeleteSandbox }: SandboxExplorerProps) {
  const [mode, setMode] = useState<ExplorerMode>('files');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  // File browser state
  const [files, setFiles] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState('/repo');
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [searchPattern, setSearchPattern] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');

  // Fetch files in directory
  const fetchFiles = useCallback(async (path: string) => {
    if (sandboxPaused) {
      setError('Sandbox is paused. Cannot explore files.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/explore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'glob', params: { pattern: `${path}/*` } }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch files');
      }
      
      const data = await response.json();
      const fileNodes: FileNode[] = (data.results || []).map((name: string) => ({
        name: name.replace(`${path}/`, '').replace(/\/$/, ''),
        type: name.endsWith('/') ? 'directory' : 'file',
      }));
      
      setFiles(fileNodes);
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch files');
    } finally {
      setLoading(false);
    }
  }, [jobId, sandboxPaused]);

  // Read file content
  const readFile = useCallback(async (filePath: string) => {
    if (sandboxPaused) {
      setError('Sandbox is paused. Cannot read files.');
      return;
    }

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
        path: filePath,
        content: data.content || '',
        error: data.error,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
      setFileContent(null);
    } finally {
      setLoading(false);
    }
  }, [jobId, sandboxPaused]);

  // Search files
  const searchFiles = useCallback(async (pattern: string) => {
    if (sandboxPaused) {
      setError('Sandbox is paused. Cannot search files.');
      return;
    }

    if (!pattern.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/explore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'grep', 
          params: { pattern, path: '/repo' } 
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to search files');
      }
      
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search files');
    } finally {
      setLoading(false);
    }
  }, [jobId, sandboxPaused]);

  // Initial file load
  useEffect(() => {
    if (mode === 'files' && files.length === 0 && !sandboxPaused) {
      fetchFiles('/repo');
    }
  }, [mode, files.length, fetchFiles, sandboxPaused]);

  // Handle file/directory click
  const handleNodeClick = (node: FileNode) => {
    if (node.type === 'directory') {
      fetchFiles(`${currentPath}/${node.name}`);
    } else {
      readFile(`${currentPath}/${node.name}`);
    }
  };

  // Navigate up
  const navigateUp = () => {
    if (currentPath === '/repo') return;
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/repo';
    fetchFiles(parentPath);
  };

  // Send chat message
  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    
    const newMessage: ChatMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');
    
    // TODO: Implement actual chat API
    // For now, just echo back
    setTimeout(() => {
      const response: ChatMessage = {
        role: 'assistant',
        content: 'Chat functionality is not yet implemented. You can use the file browser to explore the repository.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, response]);
    }, 500);
  };

  if (sandboxPaused) {
    return (
      <div className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
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
              d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Sandbox Paused
          </h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            The sandbox is currently paused and cannot be explored.
          </p>
          <button
            onClick={onDeleteSandbox}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 text-sm"
          >
            Delete Sandbox
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Mode Toggle */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-700">
        <button
          onClick={() => setMode('files')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mode === 'files'
              ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            File Browser
          </span>
        </button>
        <button
          onClick={() => setMode('chat')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mode === 'chat'
              ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Chat
          </span>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-sm flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading...
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {mode === 'files' ? (
          <div className="space-y-4">
            {/* Breadcrumb & Search */}
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
                  placeholder="Search files..."
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

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
                    Search Results ({searchResults.length})
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

            {/* File List */}
            <div className="border border-zinc-200 dark:border-zinc-700 rounded divide-y divide-zinc-200 dark:divide-zinc-700">
              {files.length === 0 ? (
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

            {/* File Content */}
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
                <div className="p-4 overflow-x-auto">
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
        ) : (
          /* Chat Mode */
          <div className="space-y-4">
            <div className="h-64 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded p-4 space-y-3 bg-white dark:bg-zinc-800">
              {messages.length === 0 ? (
                <div className="text-center text-zinc-400 dark:text-zinc-500 py-8">
                  <p className="text-sm">Chat is not yet implemented.</p>
                  <p className="text-xs mt-1">Use the file browser to explore the repository.</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                disabled
                className="flex-1 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
              />
              <button
                onClick={handleSendMessage}
                disabled
                className="px-4 py-2 bg-zinc-400 text-white text-sm rounded cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
