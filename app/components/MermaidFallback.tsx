'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import mermaid from 'mermaid';

interface DiagramState {
  hasDiagram: boolean;
  svg: string;
  error: string;
}

class MermaidRenderer {
  private state: DiagramState = { hasDiagram: false, svg: '', error: '' };
  private listeners: Set<() => void> = new Set();
  private initialized = false;

  initialize(darkMode: boolean) {
    if (!this.initialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: darkMode ? 'dark' : 'default',
        securityLevel: 'loose',
        darkMode,
      });
      this.initialized = true;
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.state;
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  async render(markdown: string) {
    if (!markdown) {
      this.state = { hasDiagram: false, svg: '', error: '' };
      this.notify();
      return;
    }

    const diagramMatch = markdown.match(/```mermaid([\s\S]*?)```/);
    if (!diagramMatch) {
      this.state = { hasDiagram: false, svg: '', error: '' };
      this.notify();
      return;
    }

    const diagramCode = diagramMatch[1].trim();

    try {
      const result = await mermaid.render(`mermaid-${Date.now()}`, diagramCode);
      this.state = { hasDiagram: true, svg: result.svg, error: '' };
    } catch (err) {
      console.error('Mermaid render error:', err);
      this.state = { 
        hasDiagram: true, 
        svg: '', 
        error: 'Failed to render diagram. The Mermaid syntax may be invalid.' 
      };
    }
    this.notify();
  }
}

const renderer = new MermaidRenderer();

export interface MermaidFallbackProps {
  markdown: string;
  darkMode?: boolean;
  className?: string;
}

export function MermaidFallback({
  markdown,
  darkMode = true,
  className = '',
}: MermaidFallbackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const state = useSyncExternalStore(
    (callback) => renderer.subscribe(callback),
    () => renderer.getSnapshot()
  );

  // Initialize mermaid
  useEffect(() => {
    renderer.initialize(darkMode);
  }, [darkMode]);

  // Render diagram when markdown changes
  useEffect(() => {
    renderer.render(markdown);
  }, [markdown]);

  // Update DOM when SVG changes
  useEffect(() => {
    if (containerRef.current && state.svg) {
      containerRef.current.innerHTML = state.svg;
    }
  }, [state.svg]);

  if (!state.hasDiagram) {
    return (
      <div className={`p-6 text-center ${className}`}>
        <p className="text-zinc-600 dark:text-zinc-400">
          No Mermaid diagram found in the system design document.
        </p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={`p-6 text-center ${className}`}>
        <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
          <p className="font-medium">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex justify-center overflow-x-auto ${className}`}
    />
  );
}

export default MermaidFallback;
