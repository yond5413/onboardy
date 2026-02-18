'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Loader2, Terminal } from 'lucide-react';

type LogEvent = {
  type: 'progress' | 'thinking' | 'tool_use' | 'complete' | 'error';
  message: string;
  timestamp: number;
};

interface AgentLogStreamProps {
  jobId: string;
  isActive: boolean;
}

export function AgentLogStream({ jobId, isActive }: AgentLogStreamProps) {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
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
        return 'text-green-400';
      case 'error':
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
        return '✓';
      case 'error':
        return '✗';
      default:
        return '•';
    }
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
        <CardContent className="pt-0">
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
