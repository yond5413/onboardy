import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { jobStore } from '@/app/lib/jobs';
import { SandboxInstance } from '@blaxel/core';
import { ensureRepoPresent } from '@/app/lib/blaxel';

// Types for exploration actions
type ExploreAction = 'read' | 'list' | 'grep';

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
 * - list: List directory contents (params: path)
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

    const body: ExploreRequest = await request.json();
    const { action, params: actionParams } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Action is required (read, list, or grep)' },
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

    // Ensure /repo exists (sandboxes may scale-to-zero on idle)
    let githubUrl = job.githubUrl;
    if (!githubUrl) {
      const supabase = await createClient();
      const { data: jobData } = await supabase
        .from('jobs')
        .select('github_url')
        .eq('id', jobId)
        .single();
      githubUrl = jobData?.github_url;
    }

    if (githubUrl) {
      const ensured = await ensureRepoPresent(sandbox, githubUrl);
      if (!ensured.ok) {
        return NextResponse.json(
          { success: false, error: `Failed to prepare repository: ${ensured.reason}` },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'No GitHub URL found for this job' },
        { status: 400 }
      );
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
        
        // Use fs.read instead of process.exec - fs API is reliable after sandbox resume
        try {
          const fileContent = await sandbox.fs.read(fullPath);
          result = {
            path: fullPath,
            content: fileContent,
          };
        } catch (readError) {
          return NextResponse.json(
            { success: false, error: `Failed to read file: ${readError instanceof Error ? readError.message : 'Unknown error'}` },
            { status: 500 }
          );
        }
        
        break;
      }
      
      case 'list': {
        const listPath = actionParams.path || '/repo';
        const safePath = listPath.replace(/\.\./g, '').replace(/[;&|`$]/g, '');
        
        // Use fs.ls instead of process.exec - fs API is reliable after sandbox resume
        try {
          const dirListing = await sandbox.fs.ls(safePath);
          
          const entries = [
            ...dirListing.subdirectories.map(d => ({ name: d.name + '/', type: 'directory' as const })),
            ...dirListing.files.map(f => ({ name: f.name, type: 'file' as const }))
          ];
          
          result = {
            path: safePath,
            entries,
          };
        } catch (listError) {
          return NextResponse.json(
            { success: false, error: `Failed to list directory: ${listError instanceof Error ? listError.message : 'Unknown error'}` },
            { status: 500 }
          );
        }
        
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
          { success: false, error: `Unknown action: ${action}. Supported actions: read, list, grep` },
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
