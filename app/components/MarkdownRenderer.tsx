'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MermaidDiagram } from '@/app/components/MermaidDiagram';

interface MarkdownRendererProps {
  content: string;
  /** When true, ```mermaid code blocks are rendered as diagrams instead of syntax-highlighted text */
  renderMermaid?: boolean;
}

export function MarkdownRenderer({ content, renderMermaid = false }: MarkdownRendererProps) {
  return (
    <div className="markdown-body prose dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Code blocks with syntax highlighting
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            // Render mermaid code blocks as diagrams when enabled
            if (!inline && language === 'mermaid' && renderMermaid) {
              return <MermaidDiagram chart={String(children)} />;
            }
            
            if (!inline && language) {
              return (
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={language}
                  PreTag="div"
                  className="rounded-lg my-4"
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              );
            }
            
            return (
              <code
                className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          
          // Tables with GitHub-style styling
          table({ children }: any) {
            return (
              <div className="overflow-x-auto my-6">
                <table className="min-w-full border-collapse border border-zinc-300 dark:border-zinc-700">
                  {children}
                </table>
              </div>
            );
          },
          
          thead({ children }: any) {
            return (
              <thead className="bg-zinc-100 dark:bg-zinc-800">
                {children}
              </thead>
            );
          },
          
          th({ children }: any) {
            return (
              <th className="border border-zinc-300 dark:border-zinc-700 px-4 py-3 text-left font-semibold text-sm">
                {children}
              </th>
            );
          },
          
          td({ children }: any) {
            return (
              <td className="border border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm">
                {children}
              </td>
            );
          },
          
          tr({ children }: any) {
            return (
              <tr className="even:bg-zinc-50 dark:even:bg-zinc-900/50">
                {children}
              </tr>
            );
          },
          
          // Headers
          h1({ children }: any) {
            return (
              <h1 className="text-3xl font-bold mt-8 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                {children}
              </h1>
            );
          },
          
          h2({ children }: any) {
            return (
              <h2 className="text-2xl font-bold mt-6 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                {children}
              </h2>
            );
          },
          
          h3({ children }: any) {
            return (
              <h3 className="text-xl font-semibold mt-5 mb-2">
                {children}
              </h3>
            );
          },
          
          h4({ children }: any) {
            return (
              <h4 className="text-lg font-semibold mt-4 mb-2">
                {children}
              </h4>
            );
          },
          
          // Lists
          ul({ children }: any) {
            return (
              <ul className="list-disc list-inside my-4 space-y-1">
                {children}
              </ul>
            );
          },
          
          ol({ children }: any) {
            return (
              <ol className="list-decimal list-inside my-4 space-y-1">
                {children}
              </ol>
            );
          },
          
          li({ children }: any) {
            return (
              <li className="ml-4">
                {children}
              </li>
            );
          },
          
          // Paragraphs
          p({ children }: any) {
            return (
              <p className="my-4 leading-relaxed">
                {children}
              </p>
            );
          },
          
          // Blockquotes
          blockquote({ children }: any) {
            return (
              <blockquote className="border-l-4 border-blue-500 pl-4 my-4 italic text-zinc-600 dark:text-zinc-400">
                {children}
              </blockquote>
            );
          },
          
          // Horizontal rule
          hr() {
            return (
              <hr className="my-8 border-zinc-200 dark:border-zinc-800" />
            );
          },
          
          // Links
          a({ children, href }: any) {
            return (
              <a 
                href={href}
                className="text-blue-600 dark:text-blue-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
          
          // Strong and emphasis
          strong({ children }: any) {
            return (
              <strong className="font-semibold">
                {children}
              </strong>
            );
          },
          
          em({ children }: any) {
            return (
              <em className="italic">
                {children}
              </em>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
