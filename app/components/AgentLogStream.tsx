'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronDown, ChevronUp, Loader2, Terminal, CheckCircle, XCircle, Clock, SkipForward } from 'lucide-react';
import type { StageName, StageStatus, StageProgress, STAGE_CONFIG } from '@/app/lib/types';

type LogEventType = 'progress' | 'thinking' | 'tool_use' | 'complete' | 'error' | 'stage_start' | 'stage_complete' | 'stage_failed' | 'stage_progress' | 'stage_skipped';

interface LogEvent {
  type: LogEventType;
  message: string;
  timestamp: number;
  stage?: StageName;
  progress?: number;
  itemProgress?: StageProgress;
  durationMs?: number;
  error?: string;
  skipReason?: string;
}

interface StageInfo {
  name: StageName;
  label: string;
  status: StageStatus;
  weight: number;
  durationMs?: number;
  itemProgress?: StageProgress;
  error?: string;
  skipReason?: string;
}

const STAGE_ORDER: StageName[] = ['clone', 'analysis', 'diagram', 'ownership', 'export'];

const STAGE_LABELS: Record<StageName, { label: string; weight: number }> = {
  clone: { label: 'Cloning', weight: 10 },
  analysis: { label: 'Analyzing', weight: 40 },
  diagram: { label: 'Diagram', weight: 25 },
  ownership: { label: 'Owners', weight: 15 },
  export: { label: 'Exporting', weight: 10 },
};

function createInitialStages(): StageInfo[] {
  return STAGE_ORDER.map(name => ({
    name,
    label: STAGE_LABELS[name].label,
    status: 'pending' as StageStatus,
    weight: STAGE_LABELS[name].weight,
  }));
}

interface AgentLogStreamProps {
  jobId: string;
  isActive: boolean;
  onComplete?: () => void;
  onStageUpdate?: (stages: StageInfo[]) => void;
}

export function AgentLogStream({ jobId, isActive, onComplete, onStageUpdate }: AgentLogStreamProps) {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [stages, setStages] = useState<StageInfo[]>(createInitialStages());
  const [startTime] = useState(() => Date.now());
  const [eta, setEta] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const eventSource = new EventSource(`/api/jobs/${jobId}/stream`);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LogEvent;
        setLogs((prev) => [...prev, data]);
        
        if (data.stage) {
          updateStageFromEvent(data);
        }

        if (data.type === 'complete') {
          onComplete?.();
          eventSource.close();
          setIsConnected(false);
        }
      } catch (e) {
        console.error('Failed to parse log event:', e);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [jobId, isActive]);

  const updateStageFromEvent = (event: LogEvent) => {
    if (!event.stage) return;
    
    setStages(prev => {
      const newStages = prev.map(stage => {
        if (stage.name !== event.stage) return stage;
        
        switch (event.type) {
          case 'stage_start':
            return { ...stage, status: 'in_progress' as StageStatus };
          case 'stage_complete':
            return { 
              ...stage, 
              status: 'completed' as StageStatus,
              durationMs: event.durationMs 
            };
          case 'stage_failed':
            return { 
              ...stage, 
              status: 'failed' as StageStatus, 
              error: event.error || event.message 
            };
          case 'stage_skipped':
            return { 
              ...stage, 
              status: 'skipped' as StageStatus,
              skipReason: event.skipReason 
            };
          case 'stage_progress':
            return { 
              ...stage, 
              status: 'in_progress' as StageStatus,
              itemProgress: event.itemProgress 
            };
          default:
            return stage;
        }
      });
      
      onStageUpdate?.(newStages);
      return newStages;
    });
  };

  useEffect(() => {
    const calculateEta = () => {
      const completedWeight = stages
        .filter(s => s.status === 'completed')
        .reduce((sum, s) => sum + s.weight, 0);
      
      const currentStage = stages.find(s => s.status === 'in_progress');
      
      if (!currentStage || completedWeight === 0) {
        setEta(null);
        return;
      }
      
      const elapsed = Date.now() - startTime;
      const progressPercent = completedWeight + (currentStage.weight * 0.5);
      
      if (progressPercent > 0) {
        const totalEstimated = (elapsed / progressPercent) * 100;
        const remaining = totalEstimated - elapsed;
        setEta(Math.max(0, Math.round(remaining / 60000)));
      }
    };

    const interval = setInterval(calculateEta, 5000);
    calculateEta();

    return () => clearInterval(interval);
  }, [stages, startTime]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getTypeColor = (type: LogEventType) => {
    switch (type) {
      case 'progress':
        return 'text-blue-400';
      case 'thinking':
        return 'text-yellow-400';
      case 'tool_use':
        return 'text-purple-400';
      case 'complete':
      case 'stage_complete':
        return 'text-green-400';
      case 'error':
      case 'stage_failed':
        return 'text-red-400';
      case 'stage_skipped':
        return 'text-orange-400';
      default:
        return 'text-gray-400';
    }
  };

  const getTypePrefix = (type: LogEventType) => {
    switch (type) {
      case 'progress':
        return '→';
      case 'thinking':
        return '💭';
      case 'tool_use':
        return '🔧';
      case 'complete':
      case 'stage_complete':
        return '✓';
      case 'error':
      case 'stage_failed':
        return '✗';
      case 'stage_skipped':
        return '⏭';
      default:
        return '•';
    }
  };

  const getCurrentProgress = () => {
    let progress = 0;
    for (const stage of stages) {
      if (stage.status === 'completed') {
        progress += stage.weight;
      } else if (stage.status === 'in_progress') {
        if (stage.itemProgress && stage.itemProgress.total > 0) {
          const stageProgress = (stage.itemProgress.current / stage.itemProgress.total) * stage.weight;
          progress += stageProgress;
        } else {
          progress += stage.weight * 0.5;
        }
        break;
      } else if (stage.status === 'failed' || stage.status === 'skipped') {
        break;
      }
    }
    return Math.min(100, Math.round(progress));
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (!isActive) return null;

  const completedCount = stages.filter(s => s.status === 'completed').length;
  const failedCount = stages.filter(s => s.status === 'failed').length;
  const skippedCount = stages.filter(s => s.status === 'skipped').length;
  const hasPartialFailure = failedCount > 0 || skippedCount > 0;

  return (
    <Card className="border-muted">
      <CardHeader className="py-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Agent Progress
            {isConnected ? (
              <span className="text-xs text-green-500 ml-2">● Live</span>
            ) : (
              <span className="text-xs text-muted-foreground ml-2">Connecting...</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
      </CardHeader>
      {isOpen && (
        <CardContent className="pt-0 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                {completedCount}/{stages.length} stages
                {hasPartialFailure && (
                  <span className="text-orange-500 ml-2">
                    ({failedCount} failed, {skippedCount} skipped)
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {eta !== null && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    ~{eta} min remaining
                  </span>
                )}
              </div>
            </div>
            
            <Progress value={getCurrentProgress()} className="h-2" />
            
            <div className="flex justify-between text-xs">
              {stages.map((stage) => (
                <div 
                  key={stage.name} 
                  className="flex flex-col items-center gap-1"
                  title={stage.error || stage.skipReason || undefined}
                >
                  <div className={`flex items-center gap-1 ${
                    stage.status === 'completed' ? 'text-green-500' :
                    stage.status === 'failed' ? 'text-red-500' :
                    stage.status === 'skipped' ? 'text-orange-500' :
                    stage.status === 'in_progress' ? 'text-blue-500' :
                    'text-muted-foreground'
                  }`}>
                    {stage.status === 'completed' ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : stage.status === 'failed' ? (
                      <XCircle className="h-3 w-3" />
                    ) : stage.status === 'skipped' ? (
                      <SkipForward className="h-3 w-3" />
                    ) : stage.status === 'in_progress' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <div className="h-3 w-3 rounded-full border" />
                    )}
                    <span className="hidden sm:inline">{stage.label}</span>
                  </div>
                  {stage.durationMs && stage.status === 'completed' && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDuration(stage.durationMs)}
                    </span>
                  )}
                  {stage.itemProgress && stage.status === 'in_progress' && (
                    <span className="text-[10px] text-muted-foreground">
                      {stage.itemProgress.current}/{stage.itemProgress.total}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-muted rounded-md p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for agent...
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`${getTypeColor(log.type)} break-words`}
                >
                  <span className="opacity-50 mr-2">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="mr-2">{getTypePrefix(log.type)}</span>
                  {log.message}
                  {log.durationMs && (
                    <span className="opacity-50 ml-2">
                      ({formatDuration(log.durationMs)})
                    </span>
                  )}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export type { StageInfo };
