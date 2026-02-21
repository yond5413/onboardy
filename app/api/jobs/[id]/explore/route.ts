import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { jobStore } from '@/app/lib/jobs';
import { SandboxInstance } from '@blaxel/core';
import { cloneRepoToSandbox } from '@/app/lib/blaxel';

// Types for exploration actions
type ExploreAction = 'read' | 'glob' | 'grep';

interface ExploreRequest {
  action: ExploreAction;
  params: {
    path?: string;
    pattern?: string;
    content?: string;
  };
}

interface ExploreResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * POST /api/jobs/[id]/explore
 * Explore files in the sandbox for a completed job
 * Actions:
 * - read: Read a file's contents (params: path)
 * - glob: Find files matching a pattern (params: pattern)
 * - grep: Search for content in files (params: pattern, content)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ExploreResponse>> {
  try {
    const { id: jobId } = await params;
    const job = jobStore.get(jobId);

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Only allow exploration for jobs with paused sandboxes
    if (!job.sandboxPaused) {
      return NextResponse.json(
        { success: false, error: 'Sandbox is not available for exploration. Job must be completed with paused sandbox.' },
        { status: 400 }
      );
    }

    const body: ExploreRequest = await request.json();
    const { action, params: actionParams } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Action is required (read, glob, or grep)' },
        { status: 400 }
      );
    }

    // Get or resume the sandbox
    let sandbox: SandboxInstance;
    try {
      sandbox = await SandboxInstance.get(job.sandboxName);
      if (!sandbox) {
        return NextResponse.json(
          { success: false, error: 'Sandbox not found' },
          { status: 404 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { success: false, error: `Failed to access sandbox: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Check if /repo exists and has files - if not, clone the repo
    try {
      const repoCheck = await sandbox.process.exec({
        command: 'ls -la /repo 2>&1',
        timeout: 10000,
      });
      
      const isEmpty = !repoCheck.stdout || 
                     repoCheck.stdout.includes('total 0') || 
                     repoCheck.stdout.includes('No such file or directory');
      
      if (isEmpty) {
        // Fetch github_url from Supabase
        const supabase = await createClient();
        const { data: jobData } = await supabase
          .from('jobs')
          .select('github_url')
          .eq('id', jobId)
          .single();
        
        if (jobData?.github_url) {
          console.log(`[Explore] /repo is empty, cloning repository from ${jobData.github_url}...`);
          const cloneResult = await cloneRepoToSandbox(sandbox, jobData.github_url);
          if (!cloneResult.success) {
            console.error(`[Explore] Failed to clone repo:`, cloneResult.error);
          } else {
            console.log(`[Explore] Repository cloned successfully`);
          }
        }
      }
    } catch (repoError) {
      console.error(`[Explore] Failed to check /repo:`, repoError);
    }

    // Execute the requested action
    let result: unknown;
    
    switch (action) {
      case 'read': {
        if (!actionParams.path) {
          return NextResponse.json(
            { success: false, error: 'Path parameter is required for read action' },
            { status: 400 }
          );
        }
        
        // Security: Ensure path is within /repo
        const safePath = actionParams.path.replace(/\.\./g, '');
        const fullPath = safePath.startsWith('/repo/') ? safePath : `/repo/${safePath}`;
        
        const readResult = await sandbox.process.exec({
          command: `cat "${fullPath}" 2>&1`,
          timeout: 30000,
        });
        
        if (readResult.exitCode !== 0) {
          return NextResponse.json(
            { success: false, error: `Failed to read file: ${readResult.stderr || readResult.stdout}` },
            { status: 500 }
          );
        }
        
        result = {
          path: fullPath,
          content: readResult.stdout,
        };
        break;
      }
      
      case 'glob': {
        if (!actionParams.pattern) {
          return NextResponse.json(
            { success: false, error: 'Pattern parameter is required for glob action' },
            { status: 400 }
          );
        }
        
        // Security: Sanitize pattern
        const safePattern = actionParams.pattern.replace(/[;&|`$]/g, '');
        
        const globResult = await sandbox.process.exec({
          command: `find /repo -type f -name "${safePattern}" 2>/dev/null | head -50`,
          timeout: 30000,
        });
        
        result = {
          pattern: actionParams.pattern,
          files: globResult.stdout?.split('\n').filter(Boolean) || [],
        };
        break;
      }
      
      case 'grep': {
        if (!actionParams.content) {
          return NextResponse.json(
            { success: false, error: 'Content parameter is required for grep action' },
            { status: 400 }
          );
        }
        
        // Security: Escape special characters in content
        const safeContent = actionParams.content.replace(/["\\]/g, '\\$&');
        const filePattern = actionParams.pattern || '*';
        
        const grepResult = await sandbox.process.exec({
          command: `grep -r "${safeContent}" /repo --include="${filePattern}" -l 2>/dev/null | head -50`,
          timeout: 30000,
        });
        
        result = {
          pattern: actionParams.content,
          filePattern,
          files: grepResult.stdout?.split('\n').filter(Boolean) || [],
        };
        break;
      }
      
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}. Supported actions: read, glob, grep` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
    
  } catch (error) {
    console.error(`[Explore] Error processing request:`, error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
