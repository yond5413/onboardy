'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, User, Bot, AlertCircle } from 'lucide-react';
import type { GraphContext } from '@/app/lib/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  context_files?: string[];
  created_at: string;
}

interface ChatPanelProps {
  jobId: string;
  isCompleted: boolean;
  initialMessage?: string;
  graphContext?: GraphContext;
  pendingPrompt?: string;
  pendingGraphContext?: GraphContext;
  onPendingPromptConsumed?: () => void;
}

function normalizeMessageContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

function getGraphContextKey(context?: GraphContext): string {
  if (!context) return 'no-context';

  return [
    context.nodeId || '',
    context.nodeLabel || '',
    context.nodeType || '',
    context.filePath || '',
    context.action || '',
    (context.relatedEdges || []).join('|'),
    (context.neighborNodes || []).join('|'),
    (context.relationshipDetails || []).join('|'),
  ].join('::');
}

function dedupeChatMessages(chatMessages: ChatMessage[]): ChatMessage[] {
  const deduped: ChatMessage[] = [];

  for (const message of chatMessages) {
    const previousMessage = deduped[deduped.length - 1];
    if (!previousMessage) {
      deduped.push(message);
      continue;
    }

    const sameRole = previousMessage.role === message.role;
    const sameContent =
      normalizeMessageContent(previousMessage.content) === normalizeMessageContent(message.content);
    const timeDiffMs = Math.abs(
      new Date(message.created_at).getTime() - new Date(previousMessage.created_at).getTime()
    );
    const isNearDuplicate = sameRole && sameContent && Number.isFinite(timeDiffMs) && timeDiffMs <= 5000;

    if (!isNearDuplicate) {
      deduped.push(message);
      continue;
    }

    const mergedContextFiles = Array.from(
      new Set([...(previousMessage.context_files || []), ...(message.context_files || [])])
    );
    deduped[deduped.length - 1] = {
      ...previousMessage,
      context_files: mergedContextFiles.length > 0 ? mergedContextFiles : undefined,
    };
  }

  return deduped;
}

export function ChatPanel({
  jobId,
  isCompleted,
  initialMessage,
  graphContext,
  pendingPrompt,
  pendingGraphContext,
  onPendingPromptConsumed,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [activeGraphContext, setActiveGraphContext] = useState<GraphContext | undefined>(graphContext);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const handledPendingKeyRef = useRef<string | null>(null);

  const loadChatHistory = useCallback(async () => {
    try {
      setIsLoadingHistory(true);
      const response = await fetch(`/api/jobs/${jobId}/chat`);
      if (!response.ok) throw new Error('Failed to load chat history');

      const data = await response.json();
      setMessages(dedupeChatMessages(data.messages || []));
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [jobId]);

  const sendChatMessage = useCallback(async (message: string, graphContext?: GraphContext) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage || sendingRef.current) return;

    sendingRef.current = true;
    setInput('');
    setIsLoading(true);
    setError(null);

    // Optimistically add user message
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId,
      role: 'user',
      content: normalizedMessage,
      created_at: new Date().toISOString(),
    }]);

    try {
      const response = await fetch(`/api/jobs/${jobId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: normalizedMessage,
          graphContext: graphContext ?? activeGraphContext,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send message');
      }

      // Remove temp message
      setMessages(prev => prev.filter(m => m.id !== tempId));

      // Reload chat history to get messages with database IDs
      // This prevents duplicates by ensuring all messages use consistent IDs
      await loadChatHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove temp message on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      sendingRef.current = false;
      setIsLoading(false);
      setActiveGraphContext(undefined);
    }
  }, [activeGraphContext, jobId, loadChatHistory]);

  // Update input and context when props change
  useEffect(() => {
    if (!initialMessage) return;
    setInput((previousInput) => (initialMessage !== previousInput ? initialMessage : previousInput));
  }, [initialMessage]);

  useEffect(() => {
    if (graphContext) {
      setActiveGraphContext(graphContext);
    }
  }, [graphContext]);

  useEffect(() => {
    if (isCompleted && jobId) {
      loadChatHistory();
    }
  }, [isCompleted, jobId, loadChatHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!pendingPrompt || !isCompleted || sendingRef.current) return;

    const pendingKey = `${normalizeMessageContent(pendingPrompt)}::${getGraphContextKey(
      pendingGraphContext
    )}`;
    if (handledPendingKeyRef.current === pendingKey) return;
    handledPendingKeyRef.current = pendingKey;

    setInput(pendingPrompt);
    sendChatMessage(pendingPrompt, pendingGraphContext).finally(() => {
      onPendingPromptConsumed?.();
    });
  }, [isCompleted, onPendingPromptConsumed, pendingGraphContext, pendingPrompt, sendChatMessage]);

  useEffect(() => {
    if (!pendingPrompt) {
      handledPendingKeyRef.current = null;
    }
  }, [pendingPrompt]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendChatMessage(input);
  };

  if (!isCompleted) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Chat is available after analysis completes</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Ask questions about this codebase
        </CardTitle>
      </CardHeader>

      <div className="flex-1 overflow-y-auto px-4">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-2">No messages yet</p>
            <p className="text-sm">Ask me anything about this codebase!</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  {message.context_files && message.context_files.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-current/10">
                      <p className="text-xs opacity-70">
                        Referenced: {message.context_files.join(', ')}
                      </p>
                    </div>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-sm text-red-500 bg-red-50 dark:bg-red-950/20">
          {error}
        </div>
      )}

      <CardContent className="pt-3">
        {activeGraphContext && (
          <div className="mb-2 px-2 py-1 text-xs text-muted-foreground bg-muted/50 rounded">
            Based on: {activeGraphContext.nodeLabel}
          </div>
        )}
        <form onSubmit={sendMessage} className="flex gap-2">
          <Input
            placeholder="Ask about the codebase..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Sandbox will pause after 30 seconds of inactivity
        </p>
      </CardContent>
    </Card>
  );
}
