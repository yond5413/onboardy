import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { resumeSandbox } from '@/app/lib/blaxel';
import { chatWithAgent, type ChatMessage } from '@/app/lib/chat-agent';
import type { SandboxInstance } from '@blaxel/core';

const IDLE_TIMEOUT_MS = 30000; // 30 seconds

let idleTimers: Map<string, NodeJS.Timeout> = new Map();

function clearIdleTimer(jobId: string) {
  const timer = idleTimers.get(jobId);
  if (timer) {
    clearTimeout(timer);
    idleTimers.delete(jobId);
  }
}

function setIdleTimer(jobId: string, _sandboxName: string) {
  clearIdleTimer(jobId);
  
  const timer = setTimeout(async () => {
    console.log(`[Chat] Idle timeout reached for ${jobId}, marking sandbox as paused`);
    try {
      // Blaxel sandboxes auto-pause after inactivity
      // We just need to update the database to reflect this
      const supabase = await createClient();
      await supabase.from('jobs').update({ sandbox_paused: true }).eq('id', jobId);
      console.log(`[Chat] Sandbox marked as paused due to idle timeout`);
    } catch (error) {
      console.error(`[Chat] Failed to mark sandbox as paused:`, error);
    }
    idleTimers.delete(jobId);
  }, IDLE_TIMEOUT_MS);
  
  idleTimers.set(jobId, timer);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    const { id: jobId } = await params;

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, user_id, status, sandbox_name, sandbox_paused, markdown_content, analysis_context')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (job.status !== 'completed') {
      return NextResponse.json(
        { error: 'Chat is only available for completed analyses' },
        { status: 400 }
      );
    }

    const { message, graphContext } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Validate graphContext if provided
    if (graphContext && typeof graphContext !== 'object') {
      return NextResponse.json(
        { error: 'Invalid graphContext format' },
        { status: 400 }
      );
    }

    // Resume sandbox if paused
    let sandbox: SandboxInstance;
    if (job.sandbox_paused) {
      console.log(`[Chat] Resuming sandbox for job ${jobId}`);
      sandbox = await resumeSandbox(job.sandbox_name);
      await supabase.from('jobs').update({ sandbox_paused: false }).eq('id', jobId);
    }

    // Get conversation history
    const { data: chatHistory, error: historyError } = await supabase
      .from('job_chats')
      .select('role, content, context_files')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (historyError) {
      console.error('[Chat] Failed to load history:', historyError);
    }

    const conversationHistory: ChatMessage[] = (chatHistory || []).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      contextFiles: msg.context_files || [],
    }));

    // Save user message with graph context
    await supabase.from('job_chats').insert({
      job_id: jobId,
      role: 'user',
      content: message,
      graph_context: graphContext || null,
    });

    // Call chat agent
    const result = await chatWithAgent(
      sandbox!,
      jobId,
      message,
      conversationHistory,
      job.markdown_content?.substring(0, 2000)
    );

    // Save assistant response
    await supabase.from('job_chats').insert({
      job_id: jobId,
      role: 'assistant',
      content: result.response,
      context_files: result.contextFiles,
    });

    // Set idle timer
    setIdleTimer(jobId, job.sandbox_name);

    return NextResponse.json({
      response: result.response,
      contextFiles: result.contextFiles,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    const { id: jobId } = await params;

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, user_id')
      .eq('id', jobId)
      .single();

    if (jobError || !job || job.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: chatHistory, error: historyError } = await supabase
      .from('job_chats')
      .select('id, role, content, context_files, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (historyError) {
      console.error('[Chat] Failed to load history:', historyError);
      return NextResponse.json(
        { error: 'Failed to load chat history' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      messages: chatHistory || [],
    });
  } catch (error) {
    console.error('Chat history error:', error);
    return NextResponse.json(
      { error: 'Failed to load chat history' },
      { status: 500 }
    );
  }
}
