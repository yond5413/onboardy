'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Layers, FileText, Info, Github } from 'lucide-react';
import mermaid from 'mermaid';
import { MarkdownRenderer } from '@/app/components/MarkdownRenderer';
import { ArchitectureDiagram } from '@/app/components/ArchitectureDiagram';
import { AnalysisContextViewer } from '@/app/components/AnalysisContextViewer';

interface JobData {
  id: string;
  github_url: string;
  status: string;
  markdown_content?: string;
  analysis_context?: any;
  react_flow_data?: any;
  created_at: string;
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  
  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('design');
  const mermaidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
    });
  }, []);

  useEffect(() => {
    async function fetchJob() {
      try {
        const response = await fetch(`/api/share/${token}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Share link not found or has expired');
          }
          throw new Error('Failed to fetch analysis');
        }
        const data = await response.json();
        setJob(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analysis');
        setLoading(false);
      }
    }

    fetchJob();
  }, [token]);

  useEffect(() => {
    if (job?.markdown_content && mermaidRef.current && activeTab === 'architecture') {
      const diagramMatch = job.markdown_content.match(/```mermaid([\s\S]*?)```/);
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
  }, [job?.markdown_content, activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading analysis...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-2xl mx-auto mt-20">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-destructive">{error || 'Analysis not found'}</p>
            <p className="text-sm text-muted-foreground mt-2">
              This share link may have been revoked or expired.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <a 
              href={job.github_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-lg font-semibold hover:text-primary transition-colors"
            >
              <Github className="h-5 w-5" />
              {job.github_url.split('/').pop()}
            </a>
            <Badge variant="outline">Public</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Analyzed on {new Date(job.created_at).toLocaleDateString()}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="design">
              <FileText className="mr-2 h-4 w-4" />
              Design
            </TabsTrigger>
            <TabsTrigger value="architecture">
              <Layers className="mr-2 h-4 w-4" />
              Architecture
            </TabsTrigger>
            <TabsTrigger value="details">
              <Info className="mr-2 h-4 w-4" />
              Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="design" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>System Design Document</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownRenderer content={job.markdown_content} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="architecture" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Architecture Diagram</CardTitle>
              </CardHeader>
              <CardContent>
                {job.react_flow_data?.architecture?.nodes?.length > 0 ? (
                  <div className="h-[600px] border rounded-lg overflow-hidden">
                    <ArchitectureDiagram
                      nodes={job.react_flow_data.architecture.nodes}
                      edges={job.react_flow_data.architecture.edges}
                    />
                  </div>
                ) : job.markdown_content?.includes('```mermaid') ? (
                  <div ref={mermaidRef} className="flex justify-center overflow-x-auto" />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No architecture diagram available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Analysis Details</CardTitle>
              </CardHeader>
              <CardContent>
                {job.analysis_context ? (
                  <AnalysisContextViewer context={job.analysis_context} />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No detailed analysis context available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <footer className="mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
          <p>Generated by <span className="font-semibold">Onboardy</span></p>
        </footer>
      </div>
    </div>
  );
}
