'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Download, 
  Trash2, 
  RefreshCw, 
  Headphones,
  FileText,
  Layers,
  Info,
  FolderOpen,
  Loader2,
  CheckCircle,
  XCircle,
  MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import mermaid from 'mermaid';
import type { PodcastStyle } from '@/app/lib/script';
import { MarkdownRenderer } from '@/app/components/MarkdownRenderer';
import { ArchitectureDiagram, type DiagramNodeData } from '@/app/components/ArchitectureDiagram';
import { AnalysisContextViewer } from '@/app/components/AnalysisContextViewer';
import { SandboxExplorer } from '@/app/components/SandboxExplorer';
import { AgentLogStream } from '@/app/components/AgentLogStream';
import { ChatPanel } from '@/app/components/ChatPanel';
import type { Node } from '@xyflow/react';


interface GraphChatContext {
  nodeId?: string;
  nodeLabel?: string;
  nodeType?: string;
  relatedEdges?: string[];
  neighborNodes?: string[];
  action?: 'explain' | 'trace' | 'debug' | 'files';
}

interface JobData {
  id: string;
  github_url: string;
  status: string;
  markdown_content?: string;
  script_content?: string;
  audio_file_path?: string;
  error?: string;
  created_at: string;
  updated_at: string;
  analysis_context?: any;
  react_flow_data?: any;
  sandbox_paused?: boolean;
}

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;
  
  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('design');
  const [generatingPodcast, setGeneratingPodcast] = useState(false);
  const [podcastStyle, setPodcastStyle] = useState<PodcastStyle>('overview');
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [pendingGraphContext, setPendingGraphContext] = useState<GraphChatContext | undefined>(undefined);
  const [selectedArchitectureNode, setSelectedArchitectureNode] = useState<Node<DiagramNodeData> | null>(null);
  const mermaidRef = useRef<HTMLDivElement>(null);

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
    });
  }, []);

  // Fetch job data
  useEffect(() => {
    async function fetchJob() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch job');
        }
        const data = await response.json();
        setJob(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load job');
        setLoading(false);
      }
    }

    fetchJob();

    // Poll for updates if job is pending
    const interval = setInterval(async () => {
      if (job && ['queued', 'processing', 'analyzing'].includes(job.status)) {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setJob(data);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  // Render mermaid diagram when tab changes
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


  function handleArchitectureNodeClick(node: Node<DiagramNodeData>) {
    setSelectedArchitectureNode(node);
  }

  function startGraphContextChat(action: NonNullable<GraphChatContext['action']>) {
    if (!selectedArchitectureNode) return;

    const nodeLabel = String(selectedArchitectureNode.data?.label || selectedArchitectureNode.id);
    const nodeType = String(selectedArchitectureNode.type || selectedArchitectureNode.data?.nodeType || 'service');

    const actionPromptMap: Record<NonNullable<GraphChatContext['action']>, string> = {
      explain: `Explain the ${nodeLabel} component, its responsibilities, and why it exists in this architecture.`,
      trace: `Trace the data flow and dependencies connected to ${nodeLabel}.`,
      debug: `If ${nodeLabel} is failing, where should I start debugging and what files should I inspect first?`,
      files: `List the most important files I should read to understand ${nodeLabel}.`,
    };

    setPendingPrompt(actionPromptMap[action]);
    const architectureEdges = job?.react_flow_data?.architecture?.edges || [];
    const architectureNodes = job?.react_flow_data?.architecture?.nodes || [];

    const relatedEdges = architectureEdges
      .filter((edge: { id: string; source: string; target: string }) => edge.source === selectedArchitectureNode.id || edge.target === selectedArchitectureNode.id)
      .map((edge: { id: string }) => edge.id);

    const neighborNodes = architectureEdges
      .filter((edge: { source: string; target: string }) => edge.source === selectedArchitectureNode.id || edge.target === selectedArchitectureNode.id)
      .map((edge: { source: string; target: string }) => edge.source === selectedArchitectureNode.id ? edge.target : edge.source)
      .map((neighborId: string) => {
        const neighbor = architectureNodes.find((node: { id: string; data?: { label?: string } }) => node.id === neighborId);
        return neighbor?.data?.label || neighborId;
      });

    setPendingGraphContext({
      nodeId: selectedArchitectureNode.id,
      nodeLabel,
      nodeType,
      action,
      relatedEdges,
      neighborNodes,
    });
    setActiveTab('chat');
  }

  async function handleGeneratePodcast() {
    setGeneratingPodcast(true);
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/podcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ podcastStyle }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate podcast');
      }

      const data = await response.json();
      setJob(prev => prev ? { ...prev, script_content: data.script } : null);
      toast.success('Podcast generated successfully!');
      setActiveTab('script');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate podcast');
    } finally {
      setGeneratingPodcast(false);
    }
  }

  async function handleDeleteJob() {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete job');
      }

      toast.success('Job deleted');
      window.location.href = '/dashboard';
    } catch (err) {
      toast.error('Failed to delete job');
    }
  }

  async function handleDownloadMarkdown() {
    if (!job?.markdown_content) return;
    
    const blob = new Blob([job.markdown_content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `system-design-${jobId}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleDownloadScript() {
    if (!job?.script_content) return;
    
    const blob = new Blob([job.script_content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `podcast-script-${jobId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleDeleteSandbox() {
    try {
      const response = await fetch(`/api/jobs/${jobId}/sandbox`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete sandbox');
      }

      setJob(prev => prev ? { ...prev, sandbox_paused: true } : null);
      toast.success('Sandbox deleted');
    } catch (err) {
      toast.error('Failed to delete sandbox');
    }
  }

  const statusColors: Record<string, string> = {
    queued: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    processing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    analyzing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    generating_podcast: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    completed: 'bg-green-500/10 text-green-500 border-green-500/20',
    failed: 'bg-red-500/10 text-red-500 border-red-500/20',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-2xl mx-auto">
        <Alert variant="destructive">
          <AlertDescription>{error || 'Job not found'}</AlertDescription>
        </Alert>
        <div className="mt-4 text-center">
          <Link href="/dashboard">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{job.github_url.split('/').pop()}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={statusColors[job.status] || ''}>
                {job.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Created {new Date(job.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {job.markdown_content && (
            <Button variant="outline" size="sm" onClick={handleDownloadMarkdown}>
              <Download className="mr-2 h-4 w-4" />
              Download MD
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={handleDeleteJob}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Pending State */}
      {['queued', 'processing', 'analyzing'].includes(job.status) && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4 py-12">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="text-center">
                <h3 className="text-lg font-semibold">Analysis in Progress</h3>
                <p className="text-muted-foreground mt-1">
                  This may take a few minutes depending on repository size
                </p>
              </div>
              <Progress value={45} className="w-64" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real-time Agent Logs */}
      {['queued', 'processing', 'analyzing'].includes(job.status) && (
        <AgentLogStream jobId={jobId} isActive={['queued', 'processing', 'analyzing'].includes(job.status)} />
      )}

      {/* Error State */}
      {job.status === 'failed' && job.error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{job.error}</AlertDescription>
        </Alert>
      )}

      {/* Completed Content */}
      {job.status === 'completed' && job.markdown_content && (
        <>
          {/* Podcast Generation Card */}
          {!job.script_content && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Headphones className="h-5 w-5" />
                  Generate Podcast
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <p className="text-sm text-muted-foreground flex-1">
                    Generate an AI-narrated podcast from your analysis
                  </p>
                  <Button 
                    onClick={handleGeneratePodcast}
                    disabled={generatingPodcast}
                  >
                    {generatingPodcast ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Headphones className="mr-2 h-4 w-4" />
                        Generate Podcast
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audio Player */}
          {job.audio_file_path && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Headphones className="h-5 w-5" />
                  Podcast Audio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <audio
                  controls
                  className="w-full"
                  src={job.audio_file_path}
                />
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="design">
                <FileText className="mr-2 h-4 w-4" />
                Design
              </TabsTrigger>
              <TabsTrigger value="architecture">
                <Layers className="mr-2 h-4 w-4" />
                Architecture
              </TabsTrigger>
              <TabsTrigger value="script" disabled={!job.script_content}>
                <Headphones className="mr-2 h-4 w-4" />
                Script
              </TabsTrigger>
              <TabsTrigger value="chat">
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="details">
                <Info className="mr-2 h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger value="explore">
                <FolderOpen className="mr-2 h-4 w-4" />
                Explore
              </TabsTrigger>
            </TabsList>

            <TabsContent value="design" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>System Design Document</CardTitle>
                  <Button variant="outline" size="sm" onClick={handleDownloadMarkdown}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
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
                        onNodeClick={handleArchitectureNodeClick}
                      />
                    </div>
                  ) : job.markdown_content?.includes('```mermaid') ? (
                    <div ref={mermaidRef} className="flex justify-center overflow-x-auto" />
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      No architecture diagram available
                    </div>
                  )}

                  {selectedArchitectureNode && (
                    <div className="mt-4 rounded-lg border p-4 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Selected node: <span className="font-medium text-foreground">{String(selectedArchitectureNode.data?.label || selectedArchitectureNode.id)}</span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => startGraphContextChat('explain')}>Explain</Button>
                        <Button size="sm" variant="outline" onClick={() => startGraphContextChat('trace')}>Trace Flow</Button>
                        <Button size="sm" variant="outline" onClick={() => startGraphContextChat('debug')}>Where to Debug</Button>
                        <Button size="sm" variant="outline" onClick={() => startGraphContextChat('files')}>Files to Read</Button>
                      </div>
                    </div>
                  )}

                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="script" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Podcast Script</CardTitle>
                  <Button variant="outline" size="sm" onClick={handleDownloadScript}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-lg">
                    {job.script_content}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="chat" className="mt-6">
              <ChatPanel 
                jobId={jobId} 
                isCompleted={job.status === 'completed'} 
                pendingPrompt={pendingPrompt}
                pendingGraphContext={pendingGraphContext}
                onPendingPromptConsumed={() => {
                  setPendingPrompt('');
                  setPendingGraphContext(undefined);
                }}
              />
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
                      No detailed analysis context available for this job
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="explore" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Sandbox Explorer</CardTitle>
                  {!job.sandbox_paused && (
                    <Button variant="destructive" size="sm" onClick={handleDeleteSandbox}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Sandbox
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <SandboxExplorer
                    jobId={jobId}
                    sandboxPaused={job.sandbox_paused || false}
                    onDeleteSandbox={handleDeleteSandbox}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
