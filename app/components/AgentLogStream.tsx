'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronDown, ChevronUp, Loader2, Terminal, CheckCircle, XCircle, Clock } from 'lucide-react';

type LogEvent = {
  type: 'progress' | 'thinking' | 'tool_use' | 'complete' | 'error' | 'stage_start' | 'stage_complete' | 'stage_failed';
  message: string;
  timestamp: number;
  stage?: string;
};

type StageStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

interface Stage {
  name: string;
  status: StageStatus;
  progress: number;
}

const STAGES: Stage[] = [
  { name: 'Queued', status: 'pending', progress: 0 },
  { name: 'Cloning', status: 'pending', progress: 20 },
  { name: 'Analyzing', status: 'pending', progress: 50 },
  { name: 'Generating', status: 'pending', progress: 80 },
];

interface AgentLogStreamProps {
  jobId: string;
  isActive: boolean;
}

export function AgentLogStream({ jobId, isActive }: AgentLogStreamProps) {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [stages, setStages] = useState<Stage[]>(STAGES);
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
          updateStageProgress(data.stage, data.type);
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

  const updateStageProgress = (stageName: string, eventType: string) => {
    setStages(prev => {
      const newStages = [...prev];
      const stageIndex = newStages.findIndex(s => s.name.toLowerCase() === stageName.toLowerCase());
      
      if (stageIndex === -1) return prev;

      if (eventType === 'stage_start' || eventType === 'progress') {
        newStages[stageIndex] = { ...newStages[stageIndex], status: 'in_progress' };
        for (let i = 0; i < stageIndex; i++) {
          newStages[i] = { ...newStages[i], status: 'completed', progress: newStages[i].progress };
        }
      } else if (eventType === 'stage_complete') {
        newStages[stageIndex] = { ...newStages[stageIndex], status: 'completed' };
      } else if (eventType === 'stage_failed' || eventType === 'error') {
        newStages[stageIndex] = { ...newStages[stageIndex], status: 'failed' };
      }
      
      return newStages;
    });
  };

  useEffect(() => {
    const calculateEta = () => {
      const completedStages = stages.filter(s => s.status === 'completed').length;
      const currentStage = stages.find(s => s.status === 'in_progress');
      
      if (!currentStage || completedStages === 0) return;
      
      const elapsed = Date.now() - startTime;
      const progressPercent = currentStage.progress;
      
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

  const getTypeColor = (type: LogEvent['type']) => {
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
      default:
        return 'text-gray-400';
    }
  };

  const getTypePrefix = (type: LogEvent['type']) => {
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
      default:
        return '•';
    }
  };

  const getCurrentProgress = () => {
    const completed = stages.filter(s => s.status === 'completed').length;
    const current = stages.find(s => s.status === 'in_progress');
    if (current) {
      return current.progress - 10 + Math.floor(Math.random() * 10);
    }
    return completed * 25;
  };

  if (!isActive) return null;

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
              <span className="font-medium">Progress</span>
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
              {stages.map((stage, index) => (
                <div 
                  key={stage.name} 
                  className={`flex items-center gap-1 ${
                    stage.status === 'completed' ? 'text-green-500' :
                    stage.status === 'failed' ? 'text-red-500' :
                    stage.status === 'in_progress' ? 'text-blue-500' :
                    'text-muted-foreground'
                  }`}
                >
                  {stage.status === 'completed' ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : stage.status === 'failed' ? (
                    <XCircle className="h-3 w-3" />
                  ) : stage.status === 'in_progress' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <div className="h-3 w-3 rounded-full border" />
                  )}
                  <span className="hidden sm:inline">{stage.name}</span>
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
