import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { jobStore } from '@/app/lib/jobs';
import { createAnalysisSandbox, pauseSandbox, cloneRepoToSandbox, collectAnalysisContext } from '@/app/lib/blaxel';
import type { SandboxInstance } from '@blaxel/core';
import { analyzeRepoWithAgent, generateDiagramWithAgent, type DiagramResult } from '@/app/lib/agent';
import { generateTTS } from '@/app/lib/elevenlabs';
import { generatePodcastScript, type PodcastStyle } from '@/app/lib/script';
import type { AnalysisJob, AnalysisContext, ReactFlowData } from '@/app/lib/types';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

function getRepoName(githubUrl: string): string {
  const match = githubUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
  return match ? match[1] : 'repository';
}

function cleanMarkdown(markdown: string): string {
  let cleaned = markdown;

  const leadingPatterns = [
    /^Here's\s+(the\s+)?/i,
    /^Sure[,.]?\s*/i,
    /^Let me\s+/i,
    /^Certainly[,.]?\s*/i,
    /^Of course[,.]?\s*/i,
    /^Here's a (brief |quick )?/i,
    /^Below is\s+/i,
    /^Below you'll find\s+/i,
  ];

  for (const pattern of leadingPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  const trailingPatterns = [
    /Let me know if you have any questions[.,]?\s*$/i,
    /Hope this helps[.,]?\s*$/i,
    /Let me know if you'd like me to elaborate[.,]?\s*$/i,
    /Feel free to ask if you need more details[.,]?\s*$/i,
    /Let me know if you need anything else[.,]?\s*$/i,
    /Please let me know if you have any questions[.,]?\s*$/i,
  ];

  for (const pattern of trailingPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();

  return cleaned;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { githubUrl, podcastStyle } = await request.json();

    if (!githubUrl) {
      return NextResponse.json(
        { error: 'githubUrl is required' },
        { status: 400 }
      );
    }

    if (!githubUrl.startsWith('https://github.com/')) {
      return NextResponse.json(
        { error: 'Invalid GitHub URL' },
        { status: 400 }
      );
    }

    const jobId = generateId();
    const shortId = jobId.substring(0, 8);
    const sandboxName = `analysis-${shortId}`;

    // Save to Supabase
    const { error: dbError } = await supabase.from('jobs').insert({
      id: jobId,
      user_id: user.id,
      github_url: githubUrl,
      status: 'queued',
      sandbox_name: sandboxName,
      podcast_style: podcastStyle || 'overview',
      sandbox_paused: false,
      deleted: false,
    });

    if (dbError) {
      console.error('Failed to create job in database:', dbError);
      return NextResponse.json(
        { error: 'Failed to create job' },
        { status: 500 }
      );
    }

    // Also store in memory for background processing
    const job: AnalysisJob = {
      id: jobId,
      githubUrl,
      status: 'queued',
      sandboxName,
      podcastStyle: (podcastStyle as PodcastStyle) || 'overview',
      createdAt: new Date(),
    };
    jobStore.create(job);

    // Start background processing
    processJob(jobId, githubUrl, sandboxName, user.id).catch((error) => {
      console.error(`Job ${jobId} failed:`, error);
    });

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (error) {
    console.error('Failed to create job:', error);
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    );
  }
}

async function processJob(
  jobId: string,
  githubUrl: string,
  sandboxName: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();
  let sandbox: SandboxInstance | null = null;

  try {
    // Update status to processing
    await supabase.from('jobs').update({ status: 'processing' }).eq('id', jobId);
    jobStore.update(jobId, { status: 'processing' });

    // Create sandbox
    sandbox = await createAnalysisSandbox(sandboxName);
    console.log(`[${jobId}] Created sandbox: ${sandboxName}`);

    // Clone repo in sandbox
    console.log(`[${jobId}] Cloning repository in sandbox...`);
    const cloneResult = await cloneRepoToSandbox(sandbox, githubUrl);
    
    if (!cloneResult.success) {
      throw new Error(`Failed to clone repository: ${cloneResult.error}`);
    }
    
    console.log(`[${jobId}] Repository cloned successfully in sandbox`);

    // Update status to analyzing
    await supabase.from('jobs').update({ status: 'analyzing' }).eq('id', jobId);
    jobStore.update(jobId, { status: 'analyzing' });

    // Step 1: Generate markdown
    const result = await analyzeRepoWithAgent(
      sandbox,
      jobId,
      (progress) => {
        console.log(`[${jobId}] ${progress}`);
      }
    );
    
    const markdown = cleanMarkdown(result.markdown);
    const analysisMetrics = result.metrics;

    console.log(`[${jobId}] Analysis complete, markdown: ${markdown.length} chars`);

    // Step 2: Generate React Flow diagram data
    let diagramResult: DiagramResult | undefined;
    let reactFlowData: ReactFlowData | undefined;
    try {
      diagramResult = await generateDiagramWithAgent(
        sandbox,
        jobId,
        (progress) => {
          console.log(`[${jobId}] ${progress}`);
        }
      );
      
      if (diagramResult.reactFlowData) {
        reactFlowData = diagramResult.reactFlowData;
        console.log(`[${jobId}] Generated reactFlowData`);
      }
    } catch (diagramError) {
      console.error(`[${jobId}] Failed to generate diagram:`, diagramError);
    }

    // Collect analysis context
    let analysisContext: AnalysisContext | undefined;
    try {
      analysisContext = await collectAnalysisContext(sandbox, githubUrl);
      if (analysisContext) {
        console.log(`[${jobId}] Collected analysis context`);
      }
    } catch (contextError) {
      console.error(`[${jobId}] Failed to collect analysis context:`, contextError);
    }

    // Update patterns if available
    if (diagramResult?.patterns && analysisContext) {
      analysisContext.patterns = {
        framework: diagramResult.patterns.framework || 'Unknown',
        architecture: diagramResult.patterns.architecture || 'Unknown',
        keyModules: diagramResult.patterns.keyModules || [],
      };
    }

    // Mark job as completed in Supabase
    await supabase.from('jobs').update({
      status: 'completed',
      markdown_content: markdown,
      analysis_metrics: analysisMetrics || undefined,
      analysis_context: analysisContext,
      react_flow_data: reactFlowData,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    // Update in-memory store
    jobStore.update(jobId, {
      status: 'completed',
      markdown,
      analysisMetrics: analysisMetrics || undefined,
      analysisContext,
      reactFlowData,
    });

    console.log(`[${jobId}] Job completed successfully`);
    
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'object' && error !== null 
        ? JSON.stringify(error, null, 2)
        : String(error);
    
    await supabase.from('jobs').update({
      status: 'failed',
      error_message: errorMessage,
    }).eq('id', jobId);

    jobStore.update(jobId, {
      status: 'failed',
      error: errorMessage,
    });
  } finally {
    if (sandbox) {
      try {
        await pauseSandbox(sandbox);
        await supabase.from('jobs').update({ sandbox_paused: true }).eq('id', jobId);
        jobStore.update(jobId, { sandboxPaused: true });
        console.log(`[${jobId}] Paused sandbox: ${sandboxName}`);
      } catch (cleanupError) {
        console.error(`[${jobId}] Failed to pause sandbox ${sandboxName}:`, cleanupError);
      }
    }
  }
}

export { generatePodcastScript, generateTTS, getRepoName };
