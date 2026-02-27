'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Download, 
  Trash2, 
  RefreshCw, 
  Headphones,
  FileText,
  Layers,
  GitBranch,
  Info,
  FolderOpen,
  Loader2,
  CheckCircle,
  XCircle,
  MessageSquare,
  Share2,
  Edit3,
  User,
  AlertTriangle,
  SkipForward,
  Music,
  Package,
  ChevronDown,
  Settings
} from 'lucide-react';
import Link from 'next/link';
import mermaid from 'mermaid';
import type { PodcastContentStyle, PodcastSettings } from '@/app/lib/script';
import { MarkdownRenderer } from '@/app/components/MarkdownRenderer';
import { ArchitectureDiagram, type DiagramNodeData } from '@/app/components/ArchitectureDiagram';
import { DataFlowDiagram, type DataFlowNodeData } from '@/app/components/DataFlowDiagram';
import { AnalysisContextViewer } from '@/app/components/AnalysisContextViewer';
import { SandboxExplorer } from '@/app/components/SandboxExplorer';
import { AgentLogStream } from '@/app/components/AgentLogStream';
import { ChatPanel } from '@/app/components/ChatPanel';
import { NodeActionsMenu } from '@/app/components/NodeActionsMenu';
import { DiagramQualityPanel } from '@/app/components/DiagramQualityPanel';
import type { GraphContext } from '@/app/lib/types';
import type { Node, Edge } from '@xyflow/react';
import type { ReactFlowNode, ReactFlowEdge } from '@/app/lib/types';
import { evaluateArchitectureDiagramQuality } from '@/app/lib/diagram-quality';
import { PodcastSettingsModal } from '@/components/podcast-settings-modal';
import { OwnerList } from '@/components/owner-badge';
import { NodeOwnersPanel } from '@/components/node-owners-panel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface PodcastVersion {
  id: string;
  version: number;
  settings: PodcastSettings;
  created_at: string;
}

interface JobData {
  id: string;
  github_url: string;
  status: string;
  markdown_content?: string;
  markdown_executive_summary?: string;
  markdown_developer_onboarding?: string;
  markdown_technical_deep_dive?: string;
  script_content?: string;
  audio_file_path?: string;
  podcast_settings?: PodcastSettings;
  ownership_data?: {
    globalOwners: Array<{
      name: string;
      email: string;
      confidence: number;
      reasons: string[];
      lastCommitDate: string;
      commitCount: number;
      recentCommitCount: number;
      filesModified?: string[];
    }>;
    components: {
      [componentId: string]: {
        componentId: string;
        componentLabel: string;
        owners: Array<{
          name: string;
          email: string;
          confidence: number;
          reasons: string[];
          lastCommitDate: string;
          commitCount: number;
          recentCommitCount: number;
          filesModified?: string[];
        }>;
        keyFiles: string[];
      };
    };
  };
  error?: string;
  created_at: string;
  updated_at: string;
  analysis_context?: any;
  react_flow_data?: any;
  sandbox_paused?: boolean;
  is_public?: boolean;
  share_token?: string;
  stage_history?: {
    clone?: { status: string; error?: string; durationMs?: number };
    analysis?: { status: string; error?: string; durationMs?: number };
    diagram?: { status: string; error?: string; durationMs?: number };
    ownership?: { status: string; error?: string; durationMs?: number };
    export?: { status: string; error?: string; durationMs?: number };
  };
  partial_status?: 'complete' | 'partial' | 'failed';
}

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;
  
  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [generatingPodcast, setGeneratingPodcast] = useState(false);
  const [podcastStyle, setPodcastStyle] = useState<PodcastContentStyle>('overview');
  const [selectedNode, setSelectedNode] = useState<Node<DiagramNodeData> | null>(null);
  const [nodeActionsPosition, setNodeActionsPosition] = useState<{ x: number; y: number } | null>(null);
  const [chatInitialMessage, setChatInitialMessage] = useState<string>('');
  const [chatGraphContext, setChatGraphContext] = useState<GraphContext | undefined>(undefined);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [editingScript, setEditingScript] = useState(false);
  const [editedScript, setEditedScript] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [pendingGraphContext, setPendingGraphContext] = useState<GraphContext | undefined>(undefined);
  const [selectedArchitectureNode, setSelectedArchitectureNode] = useState<Node<DiagramNodeData> | null>(null);
  const [diagramView, setDiagramView] = useState<'architecture' | 'dataFlow'>('architecture');
  const [retryingStage, setRetryingStage] = useState<string | null>(null);
  const [podcastVersions, setPodcastVersions] = useState<PodcastVersion[]>([]);
  const [selectedPodcastVersion, setSelectedPodcastVersion] = useState<number | null>(null);
  const [currentPodcast, setCurrentPodcast] = useState<{ script: string; audio: string | null } | null>(null);
  const mermaidRef = useRef<HTMLDivElement>(null);

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
    });
  }, []);

  // Fetch job data - also used by AgentLogStream onComplete
  const fetchJob = useCallback(async () => {
    const response = await fetch(`/api/jobs/${jobId}`);
    if (response.ok) {
      const data = await response.json();
      setJob(data);
    }
  }, [jobId]);

  // Fetch podcast versions
  const fetchPodcastVersions = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/podcast`);
      if (response.ok) {
        const data = await response.json();
        setPodcastVersions(data.podcasts || []);
        
        // If we have versions and no version is selected, select the latest
        if (data.podcasts && data.podcasts.length > 0 && !selectedPodcastVersion) {
          setSelectedPodcastVersion(data.podcasts[0].version);
        }
      }
    } catch (err) {
      console.error('Failed to fetch podcast versions:', err);
    }
  }, [jobId, selectedPodcastVersion]);

  // Fetch specific podcast version
  const fetchPodcastVersion = useCallback(async (version: number) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/podcast?version=${version}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentPodcast({
          script: data.script_content,
          audio: data.audio_file_path,
        });
      }
    } catch (err) {
      console.error('Failed to fetch podcast version:', err);
    }
  }, [jobId]);

  // Fetch + poll - original pattern restored
  // dep on job?.status causes effect to re-run when status changes, which is what transitions the UI
  useEffect(() => {
    async function loadJob() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) throw new Error('Failed to fetch job');
        const data = await response.json();
        setJob(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load job');
        setLoading(false);
      }
    }

    loadJob();

    // Poll while job is active
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

  // Fetch podcast versions when job has script content
  useEffect(() => {
    if (job?.script_content) {
      fetchPodcastVersions();
    }
  }, [job?.script_content, fetchPodcastVersions]);

  // Fetch selected podcast version
  useEffect(() => {
    if (selectedPodcastVersion) {
      fetchPodcastVersion(selectedPodcastVersion);
    }
  }, [selectedPodcastVersion, fetchPodcastVersion]);

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

  function startGraphContextChat(action: NonNullable<GraphContext['action']>) {
    if (!selectedArchitectureNode) return;

    const nodeLabel = String(selectedArchitectureNode.data?.label || selectedArchitectureNode.id);
    const nodeType = String(selectedArchitectureNode.type || selectedArchitectureNode.data?.nodeType || 'service');

    const actionPromptMap: Record<NonNullable<GraphContext['action']>, string> = {
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

  async function handleGeneratePodcast(settings: PodcastSettings) {
    setGeneratingPodcast(true);
    setSettingsModalOpen(false);
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/podcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate podcast');
      }

      const data = await response.json();
      setJob(prev => prev ? { 
        ...prev, 
        script_content: data.script,
        audio_file_path: data.audioBase64 ? `data:audio/mpeg;base64,${data.audioBase64}` : null,
      } : null);
      
      // Refresh podcast versions and select the new one
      await fetchPodcastVersions();
      setSelectedPodcastVersion(data.version);
      
      toast.success(`Podcast version ${data.version} generated successfully!`);
      setActiveTab('script');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate podcast');
    } finally {
      setGeneratingPodcast(false);
    }
  }

  async function handleExportScript() {
    const version = selectedPodcastVersion || podcastVersions[0]?.version;
    if (!version) return;
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/podcast/export?type=script&version=${version}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `podcast-script-v${version}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('Script downloaded');
    } catch (err) {
      toast.error('Failed to download script');
    }
  }

  async function handleExportAudio() {
    const version = selectedPodcastVersion || podcastVersions[0]?.version;
    if (!version) return;
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/podcast/export?type=audio&version=${version}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `podcast-audio-v${version}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('Audio downloaded');
    } catch (err) {
      toast.error('Failed to download audio');
    }
  }

  async function handleExportBoth() {
    const version = selectedPodcastVersion || podcastVersions[0]?.version;
    if (!version) return;
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/podcast/export?type=both&version=${version}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `podcast-v${version}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('Package downloaded');
    } catch (err) {
      toast.error('Failed to download package');
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

  async function handleShareToggle() {
    if (!job) return;
    
    const action = job.is_public ? 'unshare' : 'share';
    
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        throw new Error('Failed to update share status');
      }

      const data = await response.json();
      
      if (action === 'share') {
        const shareUrl = `${window.location.origin}/share/${data.share_token}`;
        await navigator.clipboard.writeText(shareUrl);
        setJob(prev => prev ? { ...prev, is_public: true, share_token: data.share_token } : null);
        toast.success('Link copied to clipboard!');
      } else {
        setJob(prev => prev ? { ...prev, is_public: false, share_token: undefined } : null);
        toast.success('Link removed');
      }
    } catch (err) {
      toast.error('Failed to update share status');
    }
  }

  async function handleRetryStage(stage: string) {
    if (!job) return;
    
    setRetryingStage(stage);
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to retry stage');
      }

      toast.success(`Retrying ${stage} stage...`);
      
      // Poll for completion
      const pollInterval = setInterval(async () => {
        const pollResponse = await fetch(`/api/jobs/${jobId}`);
        if (pollResponse.ok) {
          const data = await pollResponse.json();
          const stageStatus = data.stage_history?.[stage]?.status;
          if (stageStatus === 'completed' || stageStatus === 'failed') {
            setJob(data);
            setRetryingStage(null);
            clearInterval(pollInterval);
            if (stageStatus === 'completed') {
              toast.success(`${stage} stage completed successfully`);
            } else {
              toast.error(`${stage} stage failed again`);
            }
          }
        }
      }, 3000);
      
      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setRetryingStage(null);
      }, 5 * 60 * 1000);
      
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to retry stage');
      setRetryingStage(null);
    }
  }

  const handleNodeClick = (node: Node<DiagramNodeData>) => {
    setSelectedNode(node);
    setSelectedArchitectureNode(node);
    setNodeActionsPosition({ x: 20, y: 20 });
  };

  const handleActionSelect = (action: string, graphContext: GraphContext) => {
    if (action === 'owners') {
      // For "Who owns this" action, just close the menu and stay on architecture tab
      // The NodeOwnersPanel will be shown when a node is selected
      setNodeActionsPosition(null);
      setSelectedNode(null);
      return;
    }
    setChatInitialMessage(action);
    setChatGraphContext(graphContext);
    setPendingPrompt(action);
    setPendingGraphContext(graphContext);
    setNodeActionsPosition(null);
    setSelectedNode(null);
    setActiveTab('chat');
  };

  const handleCloseNodeActions = () => {
    setNodeActionsPosition(null);
    setSelectedNode(null);
  };

  const statusColors: Record<string, string> = {
    queued: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    processing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    analyzing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    generating_podcast: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    completed: 'bg-green-500/10 text-green-500 border-green-500/20',
    failed: 'bg-red-500/10 text-red-500 border-red-500/20',
  };

  const architectureNodes = useMemo(
    () => ((job?.react_flow_data?.architecture?.nodes ?? []) as ReactFlowNode[]),
    [job?.react_flow_data]
  );
  const architectureEdges = useMemo(
    () => ((job?.react_flow_data?.architecture?.edges ?? []) as ReactFlowEdge[]),
    [job?.react_flow_data]
  );
  const dataFlowNodes = useMemo(
    () => ((job?.react_flow_data?.dataFlow?.nodes ?? []) as ReactFlowNode[]),
    [job?.react_flow_data]
  );
  const dataFlowEdges = useMemo(
    () => ((job?.react_flow_data?.dataFlow?.edges ?? []) as ReactFlowEdge[]),
    [job?.react_flow_data]
  );
  const hasDataFlow = dataFlowNodes.length > 0;
  const qualityReport = useMemo(
    () => evaluateArchitectureDiagramQuality(architectureNodes, architectureEdges),
    [architectureNodes, architectureEdges]
  );

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
              {job.is_public && (
                <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">
                  Public
                </Badge>
              )}
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
          {job.status === 'completed' && (
            <Button variant="outline" size="sm" onClick={handleShareToggle}>
              <Share2 className="mr-2 h-4 w-4" />
              {job.is_public ? 'Unshare' : 'Share'}
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
        <AgentLogStream 
          jobId={jobId} 
          isActive={['queued', 'processing', 'analyzing'].includes(job.status)}
          onComplete={async () => {
            // Wait a moment for DB write to commit
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Force immediate refetch with cache bust
            try {
              const response = await fetch(`/api/jobs/${jobId}?_t=${Date.now()}`, { 
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
              });
              if (response.ok) {
                const data = await response.json();
                setJob(data);
              }
            } catch (error) {
              console.error('Failed to refetch job on completion:', error);
              // Fallback to existing fetchJob
              await fetchJob();
            }
          }}
        />
      )}

      {/* Error State */}
      {job.status === 'failed' && job.error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{job.error}</AlertDescription>
        </Alert>
      )}

      {/* Partial Completion Warning */}
      {job.status === 'completed' && job.partial_status === 'partial' && job.stage_history && (
        <Alert className="border-orange-500/50 bg-orange-500/10">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <AlertDescription className="text-orange-100">
            <div className="space-y-3">
              <p className="font-medium">Analysis completed with some failures</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(job.stage_history).map(([stage, info]) => {
                  const stageInfo = info as { status: string; error?: string };
                  if (stageInfo.status === 'failed') {
                    return (
                      <div key={stage} className="flex items-center gap-2 bg-background/50 rounded-md px-3 py-1.5">
                        <XCircle className="h-3 w-3 text-red-500" />
                        <span className="text-sm capitalize">{stage}</span>
                        {retryingStage === stage ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleRetryStage(stage)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        )}
                      </div>
                    );
                  }
                  if (stageInfo.status === 'skipped') {
                    return (
                      <div key={stage} className="flex items-center gap-2 bg-background/50 rounded-md px-3 py-1.5">
                        <SkipForward className="h-3 w-3 text-orange-400" />
                        <span className="text-sm capitalize">{stage}</span>
                        <span className="text-xs text-muted-foreground">(skipped)</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Some results may be incomplete. You can retry failed stages individually.
              </p>
            </div>
          </AlertDescription>
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
                    onClick={() => setSettingsModalOpen(true)}
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
          {(job.audio_file_path || currentPodcast?.audio) && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Headphones className="h-5 w-5" />
                      Podcast Audio
                    </CardTitle>
                    {podcastVersions.length > 0 && selectedPodcastVersion && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Version {selectedPodcastVersion} • {
                          new Date(
                            podcastVersions.find(v => v.version === selectedPodcastVersion)?.created_at || ''
                          ).toLocaleDateString()
                        }
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {podcastVersions.length > 1 && (
                      <Select
                        value={selectedPodcastVersion?.toString() || ''}
                        onValueChange={(value) => setSelectedPodcastVersion(parseInt(value))}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Select version" />
                        </SelectTrigger>
                        <SelectContent>
                          {podcastVersions.map((v) => (
                            <SelectItem key={v.version} value={v.version.toString()}>
                              Version {v.version} {v.version === podcastVersions[0].version && '(latest)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="mr-2 h-4 w-4" />
                          Export
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleExportScript}>
                          <FileText className="mr-2 h-4 w-4" />
                          Download Script
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportAudio}>
                          <Music className="mr-2 h-4 w-4" />
                          Download Audio
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportBoth}>
                          <Package className="mr-2 h-4 w-4" />
                          Download Both (ZIP)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setSettingsModalOpen(true)}
                      disabled={generatingPodcast}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Generate New
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <audio
                  controls
                  className="w-full"
                  src={currentPodcast?.audio || job.audio_file_path || ''}
                  key={selectedPodcastVersion}
                />
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-8">
              <TabsTrigger value="overview">
                <Info className="mr-2 h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="onboarding">
                <User className="mr-2 h-4 w-4" />
                Getting Started
              </TabsTrigger>
              <TabsTrigger value="design">
                <FileText className="mr-2 h-4 w-4" />
                Technical
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

            <TabsContent value="overview" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Executive Summary</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    High-level overview for non-technical stakeholders
                  </p>
                </CardHeader>
                <CardContent>
                  {job.markdown_executive_summary ? (
                    <MarkdownRenderer content={job.markdown_executive_summary} />
                  ) : (
                    <p className="text-muted-foreground">Executive summary not available. The analysis may not have generated layered output.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="onboarding" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Developer Onboarding</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Get started with this project - includes setup, key files, and architecture basics
                  </p>
                </CardHeader>
                <CardContent>
                  {job.markdown_developer_onboarding ? (
                    <MarkdownRenderer content={job.markdown_developer_onboarding} renderMermaid />
                  ) : (
                    <MarkdownRenderer content={job.markdown_content} renderMermaid />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="design" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Technical Deep Dive</CardTitle>
                  <Button variant="outline" size="sm" onClick={handleDownloadMarkdown}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </CardHeader>
                <CardContent>
                  {job.markdown_technical_deep_dive ? (
                    <MarkdownRenderer content={job.markdown_technical_deep_dive} renderMermaid />
                  ) : (
                    <MarkdownRenderer content={job.markdown_content} renderMermaid />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="architecture" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Diagrams</CardTitle>
                    {/* Segmented toggle: System Architecture | Data Flow */}
                    <div className="flex items-center rounded-lg border border-slate-700 bg-slate-800/60 p-0.5">
                      <button
                        onClick={() => setDiagramView('architecture')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          diagramView === 'architecture'
                            ? 'bg-slate-700 text-slate-100 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        System Architecture
                      </button>
                      <button
                        onClick={() => hasDataFlow && setDiagramView('dataFlow')}
                        disabled={!hasDataFlow}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          diagramView === 'dataFlow'
                            ? 'bg-slate-700 text-slate-100 shadow-sm'
                            : hasDataFlow
                              ? 'text-slate-400 hover:text-slate-200'
                              : 'text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        Data Flow
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* ── Architecture view ────────────────────────────── */}
                  {diagramView === 'architecture' && (
                    <>
                      {architectureNodes.length > 0 && (
                        <DiagramQualityPanel report={qualityReport} className="mb-4" />
                      )}
                      {job.react_flow_data?.architecture?.nodes?.length > 0 ? (
                        <div className="h-[600px] border rounded-lg overflow-hidden relative">
                          <ArchitectureDiagram
                            nodes={job.react_flow_data.architecture.nodes}
                            edges={job.react_flow_data.architecture.edges}
                            onNodeClick={handleNodeClick}
                          />
                          {selectedNode && nodeActionsPosition && (
                            <NodeActionsMenu
                              node={selectedNode}
                              nodes={job.react_flow_data.architecture.nodes}
                              edges={job.react_flow_data.architecture.edges}
                              position={nodeActionsPosition}
                              onSelectAction={handleActionSelect}
                              onClose={handleCloseNodeActions}
                            />
                          )}
                          {selectedArchitectureNode && (
                            <>
                              <NodeOwnersPanel
                                componentOwnership={job.ownership_data?.components?.[selectedArchitectureNode.id]}
                                globalOwners={job.ownership_data?.globalOwners || []}
                                onClose={() => setSelectedArchitectureNode(null)}
                              />
                              <div className="absolute bottom-4 left-4 bg-background/95 border rounded-lg p-3 shadow-lg">
                                <p className="text-sm text-muted-foreground mb-2">
                                  Selected: <span className="font-medium text-foreground">{String(selectedArchitectureNode.data?.label || selectedArchitectureNode.id)}</span>
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <Button size="sm" variant="outline" onClick={() => startGraphContextChat('explain')}>Explain</Button>
                                  <Button size="sm" variant="outline" onClick={() => startGraphContextChat('trace')}>Trace Flow</Button>
                                  <Button size="sm" variant="outline" onClick={() => startGraphContextChat('debug')}>Debug</Button>
                                  <Button size="sm" variant="outline" onClick={() => startGraphContextChat('files')}>Files</Button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ) : job.markdown_content?.includes('```mermaid') ? (
                        <div ref={mermaidRef} className="flex justify-center overflow-x-auto" />
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          No architecture diagram available
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Data Flow view ──────────────────────────────── */}
                  {diagramView === 'dataFlow' && (
                    <>
                      {hasDataFlow ? (
                        <div className="h-[600px] border rounded-lg overflow-hidden relative">
                          <DataFlowDiagram
                            nodes={dataFlowNodes as unknown as Node<DataFlowNodeData>[]}
                            edges={dataFlowEdges as unknown as Edge[]}
                          />
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          No data flow diagram available
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="script" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Podcast Script</CardTitle>
                    {podcastVersions.length > 0 && selectedPodcastVersion && (
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span>Version {selectedPodcastVersion}</span>
                        {(() => {
                          const version = podcastVersions.find(v => v.version === selectedPodcastVersion);
                          if (version?.settings) {
                            return (
                              <>
                                <span>•</span>
                                <span>Style: {version.settings.style}</span>
                                <span>•</span>
                                <span>Tone: {version.settings.tone}</span>
                                <span>•</span>
                                <span>Duration: {version.settings.duration}</span>
                                <span>•</span>
                                <span>Audience: {version.settings.audience}</span>
                              </>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {podcastVersions.length > 1 && (
                      <Select
                        value={selectedPodcastVersion?.toString() || ''}
                        onValueChange={(value) => setSelectedPodcastVersion(parseInt(value))}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Select version" />
                        </SelectTrigger>
                        <SelectContent>
                          {podcastVersions.map((v) => (
                            <SelectItem key={v.version} value={v.version.toString()}>
                              Version {v.version} {v.version === podcastVersions[0].version && '(latest)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="mr-2 h-4 w-4" />
                          Export
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleExportScript}>
                          <FileText className="mr-2 h-4 w-4" />
                          Download Script
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportAudio}>
                          <Music className="mr-2 h-4 w-4" />
                          Download Audio
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportBoth}>
                          <Package className="mr-2 h-4 w-4" />
                          Download Both (ZIP)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-lg">
                    {currentPodcast?.script || job.script_content}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="chat" className="mt-6">
              <ChatPanel 
                jobId={jobId} 
                isCompleted={job.status === 'completed'}
                initialMessage={chatInitialMessage}
                graphContext={chatGraphContext}
                pendingPrompt={pendingPrompt}
                pendingGraphContext={pendingGraphContext}
                onPendingPromptConsumed={() => {
                  setPendingPrompt('');
                  setPendingGraphContext(undefined);
                }}
              />
            </TabsContent>

            <TabsContent value="details" className="mt-6">
              <div className="space-y-6">
                {/* Ownership Section */}
                {job.ownership_data?.globalOwners && job.ownership_data.globalOwners.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Who to Ask
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-2">
                        Contributors who can help answer questions about this codebase
                      </p>
                    </CardHeader>
                    <CardContent>
                      <OwnerList owners={job.ownership_data.globalOwners} maxDisplay={5} />
                    </CardContent>
                  </Card>
                )}

                {/* Analysis Context Section */}
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
              </div>
            </TabsContent>

            <TabsContent value="explore" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Sandbox Explorer</CardTitle>
                  <Button variant="destructive" size="sm" onClick={handleDeleteSandbox}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Sandbox
                  </Button>
                </CardHeader>
                <CardContent>
                  <SandboxExplorer
                    jobId={jobId}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Podcast Settings Modal */}
          <Dialog open={settingsModalOpen} onOpenChange={setSettingsModalOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <PodcastSettingsModal
                open={settingsModalOpen}
                onOpenChange={setSettingsModalOpen}
                onGenerate={handleGeneratePodcast}
                isGenerating={generatingPodcast}
                existingSettings={
                  podcastVersions.length > 0 
                    ? podcastVersions[0].settings 
                    : job.podcast_settings
                }
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
