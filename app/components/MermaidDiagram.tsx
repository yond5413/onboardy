'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface MermaidDiagramProps {
  chart: string;
}

/**
 * Renders a mermaid diagram from raw mermaid code.
 * Uses dynamic import to avoid SSR issues and useId for unique render IDs.
 */
export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const id = useId().replace(/:/g, '-');

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
        });

        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${id}-${Date.now()}`,
          chart.trim()
        );

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setSvg('');
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return (
      <div className="my-4 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
        <p className="text-sm text-red-600 dark:text-red-400 font-medium">Diagram render error</p>
        <pre className="mt-2 text-xs text-red-500 overflow-x-auto whitespace-pre-wrap">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs text-zinc-500 cursor-pointer">Show source</summary>
          <pre className="mt-1 text-xs text-zinc-400 overflow-x-auto whitespace-pre-wrap">{chart}</pre>
        </details>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 p-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 animate-pulse flex items-center justify-center">
        <span className="text-sm text-zinc-500">Rendering diagram...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center overflow-x-auto [&>svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
