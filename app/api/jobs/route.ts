import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { jobStore } from '@/app/lib/jobs';
import { createAnalysisSandbox, pauseSandbox, cloneRepoToSandbox, collectAnalysisContext, ensureRepoPresent } from '@/app/lib/blaxel';
import type { SandboxInstance } from '@blaxel/core';
import { analyzeRepoWithAgent, generateDiagramWithAgent, analyzeOwnership, type OwnershipData, type DiagramResult } from '@/app/lib/agent';
import { generateTTS } from '@/app/lib/elevenlabs';
import { generatePodcastScript, type PodcastStyle } from '@/app/lib/script';
import { exportAnalysisOutputs, type ExportPaths } from '@/app/lib/storage/export';
import { JobEvents } from '@/app/lib/job-events';
import { extractLayeredMarkdown } from '@/app/lib/markdown-extractor';
import type { AnalysisMetrics } from '@/app/lib/cost-tracker';
import type { AnalysisJob, AnalysisContext, ReactFlowData, StageName, StageHistory, StageInfo, PartialStatus } from '@/app/lib/types';
import { STAGE_DEPENDENCIES } from '@/app/lib/types';

function startSandboxKeepAlive(
  sandbox: SandboxInstance,
  intervalMs: number = 15000
): { stop: () => void } {
  let stopped = false;
  let inFlight = false;

  const timer = setInterval(async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      await sandbox.fs.ls('/');
    } catch {
    } finally {
      inFlight = false;
    }
  }, intervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

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

function createInitialStageHistory(): StageHistory {
  return {
    clone: { status: 'pending' },
    analysis: { status: 'pending' },
    diagram: { status: 'pending' },
    ownership: { status: 'pending' },
    export: { status: 'pending' },
  };
}

function shouldSkipStage(stage: StageName, stageHistory: StageHistory): boolean {
  const deps = STAGE_DEPENDENCIES.find(d => d.stage === stage);
  if (!deps) return false;
  
  for (const dep of deps.dependsOn) {
    const depInfo = stageHistory[dep];
    if (depInfo.status === 'failed' || depInfo.status === 'skipped') {
      return true;
    }
  }
  return false;
}

function computePartialStatus(stageHistory: StageHistory): PartialStatus {
  if (stageHistory.clone.status === 'failed' || stageHistory.analysis.status === 'failed') {
    return 'failed';
  }
  
  const hasFailure = Object.values(stageHistory).some(s => s.status === 'failed');
  if (hasFailure) {
    return 'partial';
  }
  
  return 'complete';
}

async function updateStageHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  stage: StageName,
  info: Partial<StageInfo>
): Promise<void> {
  const { data: currentJob } = await supabase
    .from('jobs')
    .select('stage_history')
    .eq('id', jobId)
    .single();
  
  const currentHistory: StageHistory = currentJob?.stage_history || createInitialStageHistory();
  
  const updatedHistory: StageHistory = {
    ...currentHistory,
    [stage]: {
      ...currentHistory[stage],
      ...info,
    },
  };
  
  await supabase
    .from('jobs')
    .update({ stage_history: updatedHistory })
    .eq('id', jobId);
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

    const initialStageHistory = createInitialStageHistory();

    const { error: dbError } = await supabase.from('jobs').insert({
      id: jobId,
      user_id: user.id,
      github_url: githubUrl,
      status: 'queued',
      sandbox_name: sandboxName,
      podcast_style: podcastStyle || 'overview',
      sandbox_paused: false,
      deleted: false,
      stage_history: initialStageHistory,
      partial_status: 'complete',
    });

    if (dbError) {
      console.error('Failed to create job in database:', dbError);
      return NextResponse.json(
        { error: 'Failed to create job' },
        { status: 500 }
      );
    }

    const job: AnalysisJob = {
      id: jobId,
      githubUrl,
      status: 'queued',
      sandboxName,
      podcastStyle: (podcastStyle as PodcastStyle) || 'overview',
      createdAt: new Date(),
    };
    jobStore.create(job);

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

interface JobResults {
  markdown?: string;
  analysisMetrics?: AnalysisMetrics;
  layeredMarkdown?: { executiveSummary: string; developerOnboarding: string; technicalDeepDive: string };
  reactFlowData?: ReactFlowData;
  analysisContext?: AnalysisContext;
  ownershipData?: OwnershipData;
  exportPaths?: ExportPaths;
}

async function processJob(
  jobId: string,
  githubUrl: string,
  sandboxName: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();
  let sandbox: SandboxInstance | null = null;
  let keepAlive: { stop: () => void } | null = null;
  const results: JobResults = {};
  const stageHistory = createInitialStageHistory();

  const startStage = async (stage: StageName): Promise<number> => {
    const startTime = Date.now();
    const startedAt = new Date().toISOString();
    
    stageHistory[stage] = { status: 'in_progress', startedAt };
    
    await updateStageHistory(supabase, jobId, stage, { status: 'in_progress', startedAt });
    JobEvents.emitStageStart(jobId, stage, `Starting ${stage}...`);
    
    return startTime;
  };

  const completeStage = async (stage: StageName, startTime: number): Promise<void> => {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;
    
    stageHistory[stage] = {
      ...stageHistory[stage],
      status: 'completed',
      completedAt,
      durationMs,
    };
    
    await updateStageHistory(supabase, jobId, stage, { status: 'completed', completedAt, durationMs });
    JobEvents.emitStageComplete(jobId, stage, `${stage} completed in ${(durationMs / 1000).toFixed(1)}s`, durationMs);
  };

  const failStage = async (stage: StageName, startTime: number, error: unknown): Promise<void> => {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    stageHistory[stage] = {
      ...stageHistory[stage],
      status: 'failed',
      completedAt,
      durationMs,
      error: errorMessage,
    };
    
    await updateStageHistory(supabase, jobId, stage, { status: 'failed', completedAt, durationMs, error: errorMessage });
    JobEvents.emitStageFailed(jobId, stage, `${stage} failed: ${errorMessage}`, errorMessage);
  };

  const skipStage = async (stage: StageName, reason: string): Promise<void> => {
    stageHistory[stage] = { status: 'skipped', skipReason: reason };
    
    await updateStageHistory(supabase, jobId, stage, { status: 'skipped', skipReason: reason });
    JobEvents.emitStageSkipped(jobId, stage, reason);
  };

  try {
    await supabase.from('jobs').update({ status: 'processing' }).eq('id', jobId);
    jobStore.update(jobId, { status: 'processing' });

    // Stage 1: Clone
    const cloneStartTime = await startStage('clone');
    
    try {
      sandbox = await createAnalysisSandbox(sandboxName);
      console.log(`[${jobId}] Created sandbox: ${sandboxName}`);
      
      const cloneResult = await cloneRepoToSandbox(sandbox, githubUrl);
      
      if (!cloneResult.success) {
        throw new Error(`Failed to clone repository: ${cloneResult.error}`);
      }
      
      console.log(`[${jobId}] Repository cloned successfully in sandbox`);
      await completeStage('clone', cloneStartTime);
      
      keepAlive = startSandboxKeepAlive(sandbox);
    } catch (error) {
      await failStage('clone', cloneStartTime, error);
      throw error;
    }

    // Stage 2: Analysis
    await supabase.from('jobs').update({ status: 'analyzing' }).eq('id', jobId);
    jobStore.update(jobId, { status: 'analyzing' });
    
    const analysisStartTime = await startStage('analysis');
    
    try {
      await ensureRepoPresent(sandbox!, githubUrl);
      
      const result = await analyzeRepoWithAgent(
        sandbox!,
        jobId,
        (progress) => {
          console.log(`[${jobId}] ${progress}`);
        }
      );
      
      results.markdown = cleanMarkdown(result.markdown);
      results.analysisMetrics = result.metrics;
      results.layeredMarkdown = extractLayeredMarkdown(results.markdown);
      
      console.log(`[${jobId}] Analysis complete, markdown: ${results.markdown.length} chars`);
      await completeStage('analysis', analysisStartTime);
    } catch (error) {
      await failStage('analysis', analysisStartTime, error);
      throw error;
    }

    // Stage 3: Diagram (can fail without blocking)
    if (shouldSkipStage('diagram', stageHistory)) {
      await skipStage('diagram', 'Dependency failed');
    } else {
      const diagramStartTime = await startStage('diagram');
      
      try {
        await ensureRepoPresent(sandbox!, githubUrl);
        
        const diagramResult = await generateDiagramWithAgent(
          sandbox!,
          jobId,
          (progress) => {
            console.log(`[${jobId}] ${progress}`);
          }
        );
        
        if (diagramResult.reactFlowData) {
          results.reactFlowData = diagramResult.reactFlowData;
          console.log(`[${jobId}] Generated reactFlowData`);
        }
        
        await completeStage('diagram', diagramStartTime);
      } catch (error) {
        await failStage('diagram', diagramStartTime, error);
        console.error(`[${jobId}] Diagram generation failed, continuing...`);
      }
    }

    // Collect analysis context (not a tracked stage, but needed)
    try {
      await ensureRepoPresent(sandbox!, githubUrl);
      results.analysisContext = await collectAnalysisContext(sandbox!, githubUrl);
      if (results.analysisContext) {
        console.log(`[${jobId}] Collected analysis context`);
      }
    } catch (contextError) {
      console.error(`[${jobId}] Failed to collect analysis context:`, contextError);
    }

    // Stage 4: Ownership (can fail without blocking, depends on diagram)
    if (shouldSkipStage('ownership', stageHistory)) {
      await skipStage('ownership', stageHistory.diagram.status === 'skipped' 
        ? 'Diagram stage was skipped' 
        : 'Dependency failed');
    } else {
      const ownershipStartTime = await startStage('ownership');
      
      try {
        results.ownershipData = await analyzeOwnership(githubUrl, results.reactFlowData);
        console.log(`[${jobId}] Ownership analysis complete`);
        
        await completeStage('ownership', ownershipStartTime);
      } catch (error) {
        await failStage('ownership', ownershipStartTime, error);
        console.error(`[${jobId}] Ownership analysis failed, continuing...`);
      }
    }

    // Update patterns if available
    if (results.reactFlowData && results.analysisContext) {
      // Fetch diagram patterns from a stored result
      const { data: diagramJob } = await supabase
        .from('jobs')
        .select('react_flow_data')
        .eq('id', jobId)
        .single();
      
      if (diagramJob?.react_flow_data) {
        // Patterns were already captured during diagram generation
      }
    }

    // Stage 5: Export (can fail without blocking)
    if (shouldSkipStage('export', stageHistory)) {
      await skipStage('export', 'Dependency failed');
    } else {
      const exportStartTime = await startStage('export');
      
      try {
        results.exportPaths = await exportAnalysisOutputs(jobId, {
          markdown: results.markdown,
          diagramJson: results.reactFlowData ? JSON.stringify(results.reactFlowData, null, 2) : undefined,
          contextJson: results.analysisContext ? JSON.stringify(results.analysisContext, null, 2) : undefined,
        });
        
        console.log(`[${jobId}] Export complete`);
        await completeStage('export', exportStartTime);
      } catch (error) {
        await failStage('export', exportStartTime, error);
        console.error(`[${jobId}] Export failed, continuing...`);
      }
    }

    // Compute final status
    const partialStatus = computePartialStatus(stageHistory);
    const finalStatus = partialStatus === 'failed' ? 'failed' : 'completed';

    // Save final results
    await supabase.from('jobs').update({
      status: finalStatus,
      markdown_content: results.markdown,
      markdown_executive_summary: results.layeredMarkdown?.executiveSummary || undefined,
      markdown_developer_onboarding: results.layeredMarkdown?.developerOnboarding || undefined,
      markdown_technical_deep_dive: results.layeredMarkdown?.technicalDeepDive || undefined,
      analysis_metrics: results.analysisMetrics || undefined,
      analysis_context: results.analysisContext,
      react_flow_data: results.reactFlowData,
      ownership_data: results.ownershipData,
      export_paths: results.exportPaths,
      completed_at: new Date().toISOString(),
      stage_history: stageHistory,
      partial_status: partialStatus,
    }).eq('id', jobId);

    jobStore.update(jobId, {
      status: finalStatus,
      markdown: results.markdown,
      analysisMetrics: results.analysisMetrics || undefined,
      analysisContext: results.analysisContext,
      reactFlowData: results.reactFlowData,
    });

    if (partialStatus === 'partial') {
      const failedStages = Object.entries(stageHistory)
        .filter(([, info]) => info.status === 'failed')
        .map(([name]) => name);
      console.log(`[${jobId}] Job completed with partial failures: ${failedStages.join(', ')}`);
      JobEvents.emitComplete(jobId);
    } else {
      console.log(`[${jobId}] Job completed successfully`);
      JobEvents.emitComplete(jobId);
    }
    
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'object' && error !== null 
        ? JSON.stringify(error, null, 2)
        : String(error);
    
    const partialStatus = computePartialStatus(stageHistory);
    
    await supabase.from('jobs').update({
      status: 'failed',
      error_message: errorMessage,
      stage_history: stageHistory,
      partial_status: partialStatus,
    }).eq('id', jobId);

    jobStore.update(jobId, {
      status: 'failed',
      error: errorMessage,
    });

    JobEvents.emitError(jobId, errorMessage);
  } finally {
    if (keepAlive) {
      keepAlive.stop();
    }
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
