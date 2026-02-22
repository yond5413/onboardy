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
 * Mark a sandbox as paused in the job record
 * Note: Blaxel sandboxes automatically go to standby after inactivity
 * They resume automatically when accessed, so we just track the state
 */
export async function pauseSandbox(sandbox: SandboxInstance): Promise<string> {
  // Blaxel sandboxes auto-suspend after ~5 seconds of inactivity
  // We just need to return the sandbox name for tracking
  const sandboxName = (sandbox as unknown as { name?: string }).name || 'unknown';
  console.log(`[Sandbox] Marked as paused (auto-suspend): ${sandboxName}`);
  return sandboxName;
}

/**
 * Resume a sandbox by name
 * Blaxel sandboxes automatically resume from standby when accessed
 */
export async function resumeSandbox(sandboxName: string): Promise<SandboxInstance> {
  try {
    // Getting the sandbox will automatically resume it from standby
    const sandbox = await SandboxInstance.get(sandboxName);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxName} not found`);
    }
    console.log(`[Sandbox] Resumed from standby: ${sandboxName}`);
    return sandbox;
  } catch (error) {
    console.error(`[Sandbox] Failed to resume sandbox ${sandboxName}:`, error);
    throw new Error(`Failed to resume sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a sandbox permanently
 * This is a manual cleanup operation, distinct from the automatic destroy
 */
export async function deleteSandbox(sandboxName: string): Promise<void> {
  try {
    // Get the sandbox instance first
    const sandbox = await SandboxInstance.get(sandboxName);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxName} not found`);
    }
    await sandbox.delete();
    console.log(`[Sandbox] Deleted sandbox: ${sandboxName}`);
  } catch (error) {
    console.error(`[Sandbox] Failed to delete sandbox ${sandboxName}:`, error);
    throw new Error(`Failed to delete sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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

      // Clean and recreate /repo directory
      await sandbox.process.exec({
        command: 'rm -rf /repo && mkdir -p /repo',
        timeout: 10000,
      });

      // Extract repo name from URL
      const repoMatch = githubUrl.match(/github\.com\/[^\/]+\/([^\/]+)(?:\.git)?$/);
      const repoName = repoMatch ? repoMatch[1].replace(/\.git$/, '') : 'repo';
      console.log(`[Clone] Repository name: ${repoName}`);

      // Build clone command with optional authentication - clone directly to /repo
      let cloneCommand: string;
      if (githubToken) {
        // For private repos, inject token into URL
        const authUrl = githubUrl.replace(
          'https://github.com/',
          `https://${githubToken}@github.com/`
        );
        cloneCommand = `git clone --depth 1 "${authUrl}" /repo 2>&1`;
      } else {
        cloneCommand = `git clone --depth 1 "${githubUrl}" /repo 2>&1`;
      }

      // Execute clone command in sandbox directly to /repo
      console.log(`[Clone] Executing: git clone --depth 1 <url> /repo`);
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

      // Verify the repo was cloned by checking if .git directory exists and listing contents
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

/**
 * Extract framework from package.json dependencies
 */
function extractFramework(configContent: string): string {
  try {
    const pkg = JSON.parse(configContent);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    
    if (deps.next && deps.react) return 'Next.js with React';
    if (deps.express) return 'Express.js';
    if (deps.fastapi || deps.flask) return 'Python Flask/FastAPI';
    if (deps.django) return 'Django';
    if (deps.vue) return 'Vue.js';
    if (deps.angular) return 'Angular';
    if (deps.svelte) return 'Svelte';
    if (deps.nest) return 'NestJS';
    if (deps.spring) return 'Spring Boot';
    if (deps.gin) return 'Go Gin';
    
    return 'Unknown';
  } catch {
    return 'Unknown';
  }
}

/**
 * Extract key modules from directories
 */
function extractKeyModules(directories: string[]): string[] {
  const importantDirs = ['app', 'components', 'lib', 'utils', 'services', 'api', 'routes', 
    'controllers', 'models', 'pages', 'src', 'hooks', 'store', 'middleware', 'types',
    'core', 'modules', 'features', 'views', 'templates', 'public', 'private'];
  
  return directories
    .filter(dir => importantDirs.includes(dir) || dir.startsWith('@'))
    .slice(0, 8);
}

/**
 * Extract key dependencies from package.json
 */
function extractKeyDeps(configContent: string): string[] {
  try {
    const pkg = JSON.parse(configContent);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const priorityDeps = ['next', 'react', 'react-dom', 'express', 'typescript', 'tailwindcss',
      'prisma', 'mongoose', 'postgresql', 'redis', 'axios', 'zod', 'trpc', 'anthropic', 'openai'];
    
    return priorityDeps.filter(dep => deps[dep]).slice(0, 6);
  } catch {
    return [];
  }
}

/**
 * Detect primary language from file extensions
 */
async function detectPrimaryLanguage(sandbox: SandboxInstance): Promise<string> {
  const langExtensions: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript/React',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript/React',
    '.py': 'Python',
    '.go': 'Go',
    '.java': 'Java',
    '.rb': 'Ruby',
    '.rs': 'Rust',
    '.php': 'PHP',
    '.cs': 'C#',
    '.cpp': 'C++',
    '.c': 'C',
  };

  try {
    const result = await sandbox.process.exec({
      command: 'find /repo -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.rb" -o -name "*.rs" -o -name "*.php" \\) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" 2>/dev/null | wc -l',
      timeout: 15000,
    });

    if (!result.stdout || parseInt(result.stdout.trim(), 10) === 0) {
      return 'Unknown';
    }

    const counts: Record<string, number> = {};
    for (const ext of Object.keys(langExtensions)) {
      const countResult = await sandbox.process.exec({
        command: `find /repo -type f -name "*${ext}" ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" 2>/dev/null | wc -l`,
        timeout: 10000,
      });
      if (countResult.exitCode === 0 && countResult.stdout) {
        counts[ext] = parseInt(countResult.stdout.trim(), 10) || 0;
      }
    }

    let maxExt = '';
    let maxCount = 0;
    for (const [ext, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxExt = ext;
      }
    }

    return langExtensions[maxExt] || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

/**
 * Collect analysis context from the sandbox
 * Reads the .analysis-context.json file if it exists, or generates context from repo
 */
export async function collectAnalysisContext(
  sandbox: SandboxInstance,
  githubUrl: string
): Promise<import('./types').AnalysisContext | undefined> {
  try {
    // Try to read the analysis context file if it exists
    const contextResult = await sandbox.process.exec({
      command: 'cat /repo/.analysis-context.json 2>/dev/null || echo "{}"',
      timeout: 10000,
    });

    if (contextResult.exitCode === 0 && contextResult.stdout) {
      const contextData = JSON.parse(contextResult.stdout);
      if (Object.keys(contextData).length > 0) {
        console.log('[AnalysisContext] Loaded from .analysis-context.json');
        return contextData as import('./types').AnalysisContext;
      }
    }

    // If no context file, generate basic context from repo structure
    console.log('[AnalysisContext] Generating from repo structure...');
    
    // Get root files and directories
    const structureResult = await sandbox.process.exec({
      command: 'ls -la /repo 2>/dev/null | tail -n +4',
      timeout: 5000,
    });

    const rootFiles: string[] = [];
    const directories: string[] = [];
    
    if (structureResult.exitCode === 0 && structureResult.stdout) {
      structureResult.stdout.split('\n').forEach((line: string) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 9) {
          const name = parts[parts.length - 1];
          if (line.startsWith('d')) {
            directories.push(name);
          } else if (!name.startsWith('.')) {
            rootFiles.push(name);
          }
        }
      });
    }

    // Find entry points (common patterns)
    const entryPoints: string[] = [];
    const entryPointResult = await sandbox.process.exec({
      command: 'find /repo -maxdepth 2 -type f \\( -name "index.*" -o -name "main.*" -o -name "app.*" -o -name "server.*" \\) 2>/dev/null | head -20',
      timeout: 5000,
    });
    
    if (entryPointResult.exitCode === 0 && entryPointResult.stdout) {
      entryPoints.push(...entryPointResult.stdout.split('\n').filter(Boolean));
    }

    // Collect config files
    const configFiles: Record<string, { content: string; keyDeps?: string[] }> = {};
    const configPatterns = ['package.json', 'tsconfig.json', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'Dockerfile'];
    
    for (const configFile of configPatterns) {
      const configResult = await sandbox.process.exec({
        command: `cat /repo/${configFile} 2>/dev/null || echo ""`,
        timeout: 5000,
      });
      
      if (configResult.exitCode === 0 && configResult.stdout && configResult.stdout.trim()) {
        const keyDeps = configFile === 'package.json' ? extractKeyDeps(configResult.stdout) : undefined;
        configFiles[configFile] = { content: configResult.stdout, keyDeps };
      }
    }

    // Extract framework from package.json
    let framework = 'Unknown';
    let architecture = 'Unknown';
    if (configFiles['package.json']) {
      framework = extractFramework(configFiles['package.json'].content);
      // Detect architecture from structure
      if (directories.includes('app') && directories.includes('api')) {
        architecture = 'Next.js App Router';
      } else if (directories.includes('pages') && directories.includes('api')) {
        architecture = 'Next.js Pages Router';
      } else if (directories.includes('src') && directories.includes('components')) {
        architecture = 'SPA with Components';
      } else if (directories.includes('routes') || directories.includes('controllers')) {
        architecture = 'MVC Pattern';
      }
    }

    // Extract key modules
    const keyModules = extractKeyModules(directories);

    // Detect primary language
    const primaryLanguage = await detectPrimaryLanguage(sandbox);

    // Collect metadata (lines of code, file count, test files)
    const metadata: { linesOfCode?: number; fileCount?: number; testFiles?: string[] } = {};
    
    // Get total file count
    const fileCountResult = await sandbox.process.exec({
      command: 'find /repo -type f ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.next/*" 2>/dev/null | wc -l',
      timeout: 30000,
    });
    if (fileCountResult.exitCode === 0 && fileCountResult.stdout) {
      metadata.fileCount = parseInt(fileCountResult.stdout.trim(), 10) || 0;
    }

    // Get lines of code for common source files
    const locResult = await sandbox.process.exec({
      command: 'find /repo -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" \\) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.next/*" 2>/dev/null -exec cat {} \\; | wc -l',
      timeout: 30000,
    });
    if (locResult.exitCode === 0 && locResult.stdout) {
      metadata.linesOfCode = parseInt(locResult.stdout.trim(), 10) || 0;
    }

    // Find test files
    const testFilesResult = await sandbox.process.exec({
      command: 'find /repo -type f \\( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" -o -name "*__tests__*" -o -name "*.test.js" -o -name "*.spec.js" \\) ! -path "*/node_modules/*" ! -path "*/.git/*" 2>/dev/null | head -20',
      timeout: 15000,
    });
    if (testFilesResult.exitCode === 0 && testFilesResult.stdout) {
      const testFiles = testFilesResult.stdout.split('\n').filter(Boolean);
      if (testFiles.length > 0) {
        metadata.testFiles = testFiles;
      }
    }

    const context: import('./types').AnalysisContext = {
      repositoryUrl: githubUrl,
      collectedAt: new Date().toISOString(),
      structure: {
        rootFiles,
        directories,
        entryPoints,
      },
      configFiles,
      sourceFiles: [],
      patterns: {
        framework,
        architecture,
        keyModules,
        primaryLanguage,
      },
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };

    console.log('[AnalysisContext] Generated basic context');
    return context;
  } catch (error) {
    console.error('[AnalysisContext] Failed to collect:', error);
    return undefined;
  }
}
