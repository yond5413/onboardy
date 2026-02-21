import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { resumeSandbox, cloneRepoToSandbox } from '@/app/lib/blaxel';
import { chatWithAgent, ChatAgentError, type ChatMessage } from '@/app/lib/chat-agent';
import type { SandboxInstance } from '@blaxel/core';

const IDLE_TIMEOUT_MS = 30000; // 30 seconds

const idleTimers: Map<string, NodeJS.Timeout> = new Map();

function toChatErrorResponse(error: ChatAgentError) {
  switch (error.code) {
    case 'MISSING_API_KEY':
      return NextResponse.json(
        { error: 'Chat service is not configured (missing BL_API_KEY).' },
        { status: 500 }
      );
    case 'SANDBOX_NOT_AVAILABLE':
      return NextResponse.json(
        { error: 'Sandbox is unavailable. Please retry in a moment.' },
        { status: 503 }
      );
    case 'SANDBOX_METADATA_URL_MISSING':
      return NextResponse.json(
        { error: 'Sandbox is not properly initialized. Please restart the analysis and try again.' },
        { status: 500 }
      );
    case 'AGENT_NO_RESPONSE':
      return NextResponse.json(
        { error: 'Chat agent returned an empty response. Please retry your message.' },
        { status: 502 }
      );
    default:
      return NextResponse.json(
        { error: 'Failed to process chat message' },
        { status: 500 }
      );
  }
}

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
      .select('id, user_id, status, sandbox_name, sandbox_paused, github_url, markdown_content, analysis_context')
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
    if (graphContext) {
      console.log(
        `[Chat] Graph context for ${jobId}: node=${graphContext.nodeId || 'unknown'} action=${graphContext.action || 'general'}`
      );
    }

    // Ensure sandbox is available for chat
    if (job.sandbox_paused) {
      console.log(`[Chat] Resuming paused sandbox for job ${jobId}`);
      await supabase.from('jobs').update({ sandbox_paused: false }).eq('id', jobId);
    }
    console.log(`[Chat] Resuming sandbox "${job.sandbox_name}" for job ${jobId}`);
    const sandbox: SandboxInstance = await resumeSandbox(job.sandbox_name);

    // Validate sandbox has required metadata
    if (!sandbox.metadata?.url) {
      console.error(`[Chat] Sandbox ${job.sandbox_name} is missing metadata URL`);
      return NextResponse.json(
        { error: 'Sandbox is not properly initialized. Please try again or restart the analysis.' },
        { status: 500 }
      );
    }
    console.log(`[Chat] Sandbox MCP URL ready for ${jobId}: ${sandbox.metadata.url}/mcp`);

    // Check if /repo exists and has files - if not, clone the repo
    console.log(`[Chat] Checking /repo contents for sandbox ${job.sandbox_name}...`);
    try {
      const repoCheck = await sandbox.process.exec({
        command: 'ls -la /repo 2>&1',
        timeout: 10000,
      });
      
      const isEmpty = !repoCheck.stdout || 
                     repoCheck.stdout.includes('total 0') || 
                     repoCheck.stdout.includes('No such file or directory');
      
      if (isEmpty && job.github_url) {
        console.log(`[Chat] /repo is empty, cloning repository from ${job.github_url}...`);
        const cloneResult = await cloneRepoToSandbox(sandbox, job.github_url);
        if (!cloneResult.success) {
          console.error(`[Chat] Failed to clone repo:`, cloneResult.error);
        } else {
          console.log(`[Chat] Repository cloned successfully`);
        }
      } else {
        console.log(`[Chat] /repo contents:\n${repoCheck.stdout}`);
      }
    } catch (repoError) {
      console.error(`[Chat] Failed to check /repo:`, repoError);
    }

    // Get conversation history
    const { data: chatHistory, error: historyError } = await supabase
      .from('job_chats')
      .select('role, content, context_files')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (historyError) {
      console.error('[Chat] Failed to load history:', historyError);
      console.error('[Chat] History error details:', JSON.stringify(historyError));
      // Continue with empty history rather than failing the request
      // This allows chat to work even if history loading fails
    }

    const conversationHistory: ChatMessage[] = (chatHistory || []).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      contextFiles: msg.context_files || [],
    }));

    console.log(`[Chat] Loaded ${conversationHistory.length} messages from history`);

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
      job.markdown_content?.substring(0, 2000),
      graphContext
    );
    console.log(
      `[Chat] Agent response complete for ${jobId}. Referenced context files: ${result.contextFiles.length}`
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
    if (error instanceof ChatAgentError) {
      console.error('[Chat] Agent configuration/runtime error:', error.code, error.message, error.details);
      return toChatErrorResponse(error);
    }
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
