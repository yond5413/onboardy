'use client';

import { useState } from 'react';

interface SourceFile {
  path: string;
  summary: string;
  imports?: string[];
  exports?: string[];
}

interface CodePatterns {
  framework: string;
  architecture: string;
  keyModules: string[];
  primaryLanguage?: string;
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
  patterns: CodePatterns;
  metadata?: {
    linesOfCode?: number;
    fileCount?: number;
    testFiles?: string[];
  };
}

interface AnalysisContextViewerProps {
  context: AnalysisContext;
  maxSummaryLength?: number;
}

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({ title, children, defaultExpanded = false }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-between hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
      >
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{title}</span>
        <span className="text-zinc-500 dark:text-zinc-400">
          {isExpanded ? '−' : '+'}
        </span>
      </button>
      {isExpanded && (
        <div className="p-4 bg-white dark:bg-zinc-900">
          {children}
        </div>
      )}
    </div>
  );
}

function TruncatedSummary({ summary, maxLength = 150 }: { summary: string; maxLength?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (summary.length <= maxLength) {
    return <p className="text-zinc-700 dark:text-zinc-300 text-sm">{summary}</p>;
  }

  return (
    <div>
      <p className="text-zinc-700 dark:text-zinc-300 text-sm">
        {isExpanded ? summary : `${summary.slice(0, maxLength)}...`}
      </p>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-2 text-blue-600 dark:text-blue-400 text-sm hover:underline"
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}

export function AnalysisContextViewer({ context, maxSummaryLength = 150 }: AnalysisContextViewerProps) {
  return (
    <div className="space-y-4">
      {/* Repository Info */}
      <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">
          Repository Information
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="col-span-2">
            <span className="text-zinc-500 dark:text-zinc-400">URL:</span>
            <a 
              href={context.repositoryUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="ml-2 text-blue-600 dark:text-blue-400 hover:underline"
            >
              {context.repositoryUrl.replace('https://github.com/', '')}
            </a>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Collected:</span>
            <span className="ml-2 text-zinc-700 dark:text-zinc-300">
              {new Date(context.collectedAt).toLocaleDateString()}
            </span>
          </div>
          {context.metadata?.fileCount && (
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Total Files:</span>
              <span className="ml-2 text-zinc-700 dark:text-zinc-300 font-medium">
                {context.metadata.fileCount.toLocaleString()}
              </span>
            </div>
          )}
          {context.metadata?.linesOfCode && (
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Lines of Code:</span>
              <span className="ml-2 text-zinc-700 dark:text-zinc-300 font-medium">
                {context.metadata.linesOfCode.toLocaleString()}
              </span>
            </div>
          )}
          {context.metadata?.testFiles && context.metadata.testFiles.length > 0 && (
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Test Files:</span>
              <span className="ml-2 text-zinc-700 dark:text-zinc-300 font-medium">
                {context.metadata.testFiles.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Patterns */}
      <CollapsibleSection title="Patterns & Framework" defaultExpanded={true}>
        <div className="grid grid-cols-2 gap-4">
          {(context.patterns.primaryLanguage && context.patterns.primaryLanguage !== 'Unknown') && (
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 text-sm block">Language</span>
              <span className="text-zinc-800 dark:text-zinc-200 font-medium">
                {context.patterns.primaryLanguage}
              </span>
            </div>
          )}
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 text-sm block">Framework</span>
            <span className="text-zinc-800 dark:text-zinc-200 font-medium">
              {context.patterns.framework !== 'Unknown' ? context.patterns.framework : 'Not detected'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 text-sm block">Architecture</span>
            <span className="text-zinc-800 dark:text-zinc-200 font-medium">
              {context.patterns.architecture !== 'Unknown' ? context.patterns.architecture : 'Not detected'}
            </span>
          </div>
        </div>
        {context.patterns.keyModules.length > 0 && (
          <div className="mt-4">
            <span className="text-zinc-500 dark:text-zinc-400 text-sm block mb-2">Key Modules</span>
            <div className="flex flex-wrap gap-2">
              {context.patterns.keyModules.map((module, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs rounded"
                >
                  {module}
                </span>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Structure */}
      <CollapsibleSection title="Project Structure">
        <div className="space-y-4">
          {context.structure.entryPoints.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-2">
                Entry Points
              </h4>
              <ul className="space-y-1">
                {context.structure.entryPoints.slice(0, 5).map((entry, idx) => (
                  <li key={idx} className="text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                    <span className="text-green-600 dark:text-green-400">→</span> {entry.replace('/repo/', '')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {context.structure.directories.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-2">
                Directory Structure ({context.structure.directories.length} folders)
              </h4>
              <div className="flex flex-wrap gap-2">
                {context.structure.directories.slice(0, 15).map((dir, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs rounded font-mono"
                  >
                    {dir}/
                  </span>
                ))}
                {context.structure.directories.length > 15 && (
                  <span className="px-2 py-1 text-zinc-500 dark:text-zinc-500 text-xs italic">
                    +{context.structure.directories.length - 15} more...
                  </span>
                )}
              </div>
            </div>
          )}
          
          {context.structure.rootFiles.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-2">
                Root Files
              </h4>
              <ul className="grid grid-cols-2 gap-1 text-sm">
                {context.structure.rootFiles.slice(0, 12).map((file, idx) => (
                  <li key={idx} className="text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                    {file}
                  </li>
                ))}
                {context.structure.rootFiles.length > 12 && (
                  <li className="text-zinc-500 dark:text-zinc-500 text-xs italic">
                    +{context.structure.rootFiles.length - 12} more...
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Config Files */}
      {Object.keys(context.configFiles).length > 0 && (
        <CollapsibleSection title="Configuration Files">
          <div className="space-y-3">
            {Object.entries(context.configFiles).map(([filename, config]) => (
              <div key={filename} className="border-l-2 border-zinc-300 dark:border-zinc-600 pl-3">
                <h4 className="font-mono text-sm text-zinc-800 dark:text-zinc-200">{filename}</h4>
                {config.keyDeps && config.keyDeps.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {config.keyDeps.map((dep, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs rounded"
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Source Files */}
      {context.sourceFiles.length > 0 && (
        <CollapsibleSection title={`Source Files (${context.sourceFiles.length})`}>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {context.sourceFiles.slice(0, 20).map((file, idx) => (
              <div key={idx} className="border border-zinc-200 dark:border-zinc-700 rounded p-3">
                <h4 className="font-mono text-sm text-blue-600 dark:text-blue-400 mb-2">
                  {file.path}
                </h4>
                <TruncatedSummary summary={file.summary} maxLength={maxSummaryLength} />
                {file.imports && file.imports.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">Imports:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {file.imports.slice(0, 5).map((imp, i) => (
                        <span key={i} className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                          {imp}
                        </span>
                      ))}
                      {file.imports.length > 5 && (
                        <span className="text-xs text-zinc-500">
                          +{file.imports.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {context.sourceFiles.length > 20 && (
              <p className="text-center text-zinc-500 dark:text-zinc-500 text-sm italic">
                +{context.sourceFiles.length - 20} more files...
              </p>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Test Files */}
      {context.metadata?.testFiles && context.metadata.testFiles.length > 0 && (
        <CollapsibleSection title={`Test Files (${context.metadata.testFiles.length})`}>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {context.metadata.testFiles.slice(0, 15).map((file, idx) => (
              <li key={idx} className="text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                {file}
              </li>
            ))}
            {context.metadata.testFiles.length > 15 && (
              <li className="text-zinc-500 dark:text-zinc-500 text-xs italic">
                +{context.metadata.testFiles.length - 15} more...
              </li>
            )}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  );
}
