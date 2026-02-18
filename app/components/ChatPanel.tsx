'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, User, Bot, AlertCircle } from 'lucide-react';

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
}

export function ChatPanel({ jobId, isCompleted }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isCompleted && jobId) {
      loadChatHistory();
    }
  }, [jobId, isCompleted]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChatHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await fetch(`/api/jobs/${jobId}/chat`);
      if (!response.ok) throw new Error('Failed to load chat history');
      
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const message = input.trim();
    if (!message || isLoading) return;

    setInput('');
    setIsLoading(true);
    setError(null);

    // Optimistically add user message
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    }]);

    try {
      const response = await fetch(`/api/jobs/${jobId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send message');
      }

      const data = await response.json();
      
      // Remove temp message and add real messages
      setMessages(prev => prev.filter(m => m.id !== tempId));
      
      // Add user message (from server response would be ideal but we're adding optimistically)
      setMessages(prev => [...prev, {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      }, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        context_files: data.contextFiles,
        created_at: new Date().toISOString(),
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove temp message on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
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
