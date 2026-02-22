import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { resumeSandbox, ensureRepoPresent } from '@/app/lib/blaxel';
import { generateDiagramWithAgent, analyzeOwnership, type OwnershipData, type DiagramResult } from '@/app/lib/agent';
import { JobEvents } from '@/app/lib/job-events';
import { exportAnalysisOutputs, type ExportPaths } from '@/app/lib/storage/export';
import type { StageName, StageHistory, ReactFlowData } from '@/app/lib/types';

interface RetryableStage {
  name: StageName;
  execute: () => Promise<void>;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { stage } = await request.json();
    
    if (!stage) {
      return NextResponse.json({ error: 'Stage is required' }, { status: 400 });
    }

    const validStages: StageName[] = ['diagram', 'ownership', 'export'];
    if (!validStages.includes(stage)) {
      return NextResponse.json(
        { error: `Invalid stage. Retryable stages: ${validStages.join(', ')}` },
        { status: 400 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, user_id, status, stage_history, sandbox_name, github_url, markdown_content, react_flow_data')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const stageHistory: StageHistory = job.stage_history || {};
    const stageInfo = stageHistory[stage as StageName];
    
    if (stageInfo?.status !== 'failed') {
      return NextResponse.json(
        { error: `Stage '${stage}' is not in a failed state. Current status: ${stageInfo?.status || 'unknown'}` },
        { status: 400 }
      );
    }

    processRetry(jobId, job.github_url, job.sandbox_name, stage as StageName, job.markdown_content, job.react_flow_data).catch((error) => {
      console.error(`[${jobId}] Retry of ${stage} failed:`, error);
    });

    return NextResponse.json({ 
      message: `Retrying ${stage} stage`,
      stage 
    }, { status: 202 });
    
  } catch (error) {
    console.error(`Error retrying stage:`, error);
    return NextResponse.json(
      { error: 'Failed to retry stage' },
      { status: 500 }
    );
  }
}

async function processRetry(
  jobId: string,
  githubUrl: string,
  sandboxName: string,
  stage: StageName,
  existingMarkdown: string | null,
  existingReactFlowData: ReactFlowData | null
): Promise<void> {
  const supabase = await createClient();
  let sandbox;
  let startTime = Date.now();
  
  try {
    sandbox = await resumeSandbox(sandboxName);
    await ensureRepoPresent(sandbox, githubUrl);

    startTime = Date.now();
    const startedAt = new Date().toISOString();
    
    const { data: currentJob } = await supabase
      .from('jobs')
      .select('stage_history')
      .eq('id', jobId)
      .single();
    
    const stageHistory: StageHistory = currentJob?.stage_history || {};
    stageHistory[stage] = { status: 'in_progress', startedAt };
    
    await supabase
      .from('jobs')
      .update({ stage_history: stageHistory })
      .eq('id', jobId);
    
    JobEvents.emitStageStart(jobId, stage, `Retrying ${stage}...`);

    let diagramResult: DiagramResult | undefined;
    let ownershipData: OwnershipData | undefined;
    let exportPaths: ExportPaths | undefined;

    if (stage === 'diagram') {
      diagramResult = await generateDiagramWithAgent(
        sandbox,
        jobId,
        (progress) => console.log(`[${jobId}] ${progress}`)
      );
      
      if (diagramResult.reactFlowData) {
        await supabase
          .from('jobs')
          .update({ react_flow_data: diagramResult.reactFlowData })
          .eq('id', jobId);
      }
    }
    
    if (stage === 'ownership') {
      const { data: latestJob } = await supabase
        .from('jobs')
        .select('react_flow_data')
        .eq('id', jobId)
        .single();
      
      ownershipData = await analyzeOwnership(sandbox, latestJob?.react_flow_data);
      
      await supabase
        .from('jobs')
        .update({ ownership_data: ownershipData })
        .eq('id', jobId);
    }
    
    if (stage === 'export') {
      const { data: fullJob } = await supabase
        .from('jobs')
        .select('markdown_content, react_flow_data, analysis_context')
        .eq('id', jobId)
        .single();
      
      if (fullJob?.markdown_content) {
        exportPaths = await exportAnalysisOutputs(jobId, {
          markdown: fullJob.markdown_content,
          diagramJson: fullJob.react_flow_data ? JSON.stringify(fullJob.react_flow_data, null, 2) : undefined,
          contextJson: fullJob.analysis_context ? JSON.stringify(fullJob.analysis_context, null, 2) : undefined,
        });
        
        await supabase
          .from('jobs')
          .update({ export_paths: exportPaths })
          .eq('id', jobId);
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;
    
    const { data: finalJob } = await supabase
      .from('jobs')
      .select('stage_history')
      .eq('id', jobId)
      .single();
    
    const finalHistory: StageHistory = finalJob?.stage_history || {};
    finalHistory[stage] = { status: 'completed', completedAt, durationMs };
    
    await supabase
      .from('jobs')
      .update({ stage_history: finalHistory })
      .eq('id', jobId);
    
    JobEvents.emitStageComplete(jobId, stage, `${stage} completed`, durationMs);
    
    // Update partial_status if all stages now pass
    const hasFailed = Object.values(finalHistory).some(s => s.status === 'failed');
    if (!hasFailed) {
      await supabase
        .from('jobs')
        .update({ partial_status: 'complete' })
        .eq('id', jobId);
    }
    
    console.log(`[${jobId}] Retry of ${stage} completed successfully`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;
    
    const { data: failJob } = await supabase
      .from('jobs')
      .select('stage_history')
      .eq('id', jobId)
      .single();
    
    const failHistory: StageHistory = failJob?.stage_history || {};
    failHistory[stage] = { status: 'failed', completedAt, durationMs, error: errorMessage };
    
    await supabase
      .from('jobs')
      .update({ stage_history: failHistory })
      .eq('id', jobId);
    
    JobEvents.emitStageFailed(jobId, stage, `${stage} failed: ${errorMessage}`, errorMessage);
    throw error;
  }
}
