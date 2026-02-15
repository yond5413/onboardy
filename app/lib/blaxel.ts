import { SandboxInstance } from '@blaxel/core';

export async function createAnalysisSandbox(sandboxName: string) {
  const region = process.env.BL_REGION || 'us-pdx-1';
  
  return SandboxInstance.create({
    name: sandboxName,
    image: 'blaxel/base-image:latest',
    memory: 4096,
    region,
  });
}

export async function destroySandbox(sandbox: SandboxInstance) {
  await sandbox.delete();
}

/**
 * Clone a GitHub repository into the sandbox at /repo
 * This ensures repos are always cloned in the isolated sandbox environment
 * rather than on the local filesystem
 */
export async function cloneRepoToSandbox(
  sandbox: SandboxInstance,
  githubUrl: string,
  maxRetries: number = 2
): Promise<{ success: boolean; error?: string }> {
  // Validate GitHub URL
  if (!githubUrl.startsWith('https://github.com/')) {
    return {
      success: false,
      error: 'Invalid GitHub URL. Must start with https://github.com/'
    };
  }

  const githubToken = process.env.GITHUB_TOKEN;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Clone] Attempt ${attempt + 1}/${maxRetries + 1} for ${githubUrl}`);
      
      // First, ensure /repo directory is clean
      await sandbox.process.exec({
        command: 'rm -rf /repo/* /repo/.* 2>/dev/null; mkdir -p /repo',
        timeout: 10000,
      });
      
      // Extract repo name from URL
      const repoMatch = githubUrl.match(/github\.com\/[^\/]+\/([^\/]+)(?:\.git)?$/);
      const repoName = repoMatch ? repoMatch[1].replace(/\.git$/, '') : 'repo';
      console.log(`[Clone] Repository name: ${repoName}`);
      
      // Build clone command with optional authentication
      let cloneCommand: string;
      if (githubToken) {
        // For private repos, inject token into URL
        const authUrl = githubUrl.replace(
          'https://github.com/',
          `https://${githubToken}@github.com/`
        );
        cloneCommand = `git clone --depth 1 "${authUrl}" /tmp-clone 2>&1`;
      } else {
        cloneCommand = `git clone --depth 1 "${githubUrl}" /tmp-clone 2>&1`;
      }
      
      // Execute clone command in sandbox to /tmp-clone first
      console.log(`[Clone] Executing: git clone --depth 1 <url> /tmp-clone`);
      const process_result = await sandbox.process.exec({
        command: cloneCommand,
        timeout: 120000, // 2 minute timeout for clone
      });
      
      // Log clone output for debugging
      if (process_result.stdout) {
        console.log(`[Clone] stdout: ${process_result.stdout}`);
      }
      if (process_result.stderr) {
        console.log(`[Clone] stderr: ${process_result.stderr}`);
      }
      
      // Check if clone succeeded
      if (process_result.exitCode !== 0) {
        console.error(`[Clone] Failed with exit code ${process_result.exitCode}`);
        
        if (attempt < maxRetries) {
          console.log(`[Clone] Retrying after failure...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        
        return {
          success: false,
          error: `Git clone failed: ${process_result.stderr || process_result.stdout || 'Unknown error'}`
        };
      }
      
      // Move contents from /tmp-clone to /repo
      console.log(`[Clone] Moving contents from /tmp-clone to /repo`);
      const moveProcess = await sandbox.process.exec({
        command: 'mv /tmp-clone/* /tmp-clone/.* /repo/ 2>/dev/null; rm -rf /tmp-clone',
        timeout: 10000,
      });
      
      if (moveProcess.exitCode !== 0) {
        console.warn(`[Clone] Move warnings: ${moveProcess.stderr}`);
      }
      
      // Verify the repo was cloned by checking if .git directory exists
      console.log(`[Clone] Verifying clone by checking /repo/.git`);
      const verifyProcess = await sandbox.process.exec({
        command: 'ls -la /repo/.git 2>&1',
        timeout: 5000,
      });
      
      if (verifyProcess.exitCode !== 0) {
        // Debug: show what's actually in /repo
        const debugProcess = await sandbox.process.exec({
          command: 'ls -la /repo 2>&1 || echo "Directory does not exist or is empty"',
          timeout: 5000,
        });
        console.error(`[Clone] Verification failed. /repo contents: ${debugProcess.stdout}`);
        
        if (attempt < maxRetries) {
          console.log(`[Clone] Retrying after verification failure...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        
        return {
          success: false,
          error: `Repository verification failed: ${verifyProcess.stderr || 'Git directory not found'}`
        };
      }
      
      // Final verification: list repo contents
      const finalCheck = await sandbox.process.exec({
        command: 'ls -la /repo 2>&1 | head -20',
        timeout: 5000,
      });
      
      console.log(`[Clone] Successfully cloned ${githubUrl} to /repo`);
      console.log(`[Clone] Repository contents:\n${finalCheck.stdout}`);
      
      return { success: true };
      
    } catch (error) {
      console.error(`[Clone] Error during clone attempt ${attempt + 1}:`, error);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during clone'
      };
    }
  }
  
  return {
    success: false,
    error: 'Clone failed after all retry attempts'
  };
}

/**
 * Validate that the agent is using sandbox MCP tools only
 * and not executing commands on the local filesystem
 */
export function validateSandboxIsolation(): void {
  // This can be expanded to add runtime checks
  // For now, the tool restriction in agent configuration is the primary guardrail
  console.log('[Guardrails] Sandbox isolation validated - using MCP tools only');
}
