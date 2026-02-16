import { NextResponse } from 'next/server';
import { jobStore } from '@/app/lib/jobs';
import { deleteSandbox } from '@/app/lib/blaxel';

interface SandboxResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * DELETE /api/jobs/[id]/sandbox
 * Manually delete a paused sandbox for cleanup
 * This allows users to free up resources after they're done exploring
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<SandboxResponse>> {
  try {
    const { id: jobId } = await params;
    const job = jobStore.get(jobId);

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check if sandbox is paused
    if (!job.sandboxPaused) {
      return NextResponse.json(
        { success: false, error: 'No paused sandbox to delete. Sandbox may already be destroyed or job is not completed.' },
        { status: 400 }
      );
    }

    // Delete the sandbox
    try {
      await deleteSandbox(job.sandboxName);
      
      // Update job to reflect sandbox deletion
      jobStore.update(jobId, {
        sandboxPaused: false,
        status: 'destroyed',
      });

      console.log(`[Sandbox] Manually deleted sandbox ${job.sandboxName} for job ${jobId}`);

      return NextResponse.json({
        success: true,
        message: `Sandbox ${job.sandboxName} has been deleted successfully`,
      });
    } catch (deleteError) {
      console.error(`[Sandbox] Failed to delete sandbox ${job.sandboxName}:`, deleteError);
      
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to delete sandbox: ${deleteError instanceof Error ? deleteError.message : 'Unknown error'}` 
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error(`[Sandbox] Error processing delete request:`, error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
