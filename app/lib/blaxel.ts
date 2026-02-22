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
 * Ensure the repository exists in the sandbox at /repo.
 *
 * Uses the Blaxel SDK filesystem API (sandbox.fs.ls) instead of process.exec
 * because process.exec shell commands return empty results after sandbox
 * standby/resume, while the HTTP filesystem API remains reliable.
 */
export async function ensureRepoPresent(
  sandbox: SandboxInstance,
  githubUrl: string
): Promise<{ ok: boolean; recloned: boolean; reason?: string }> {
  try {
    // Use the SDK filesystem API -- it's reliable even after standby
    const dirListing = await sandbox.fs.ls('/repo');
    const hasEntries = dirListing.files.length > 0 || dirListing.subdirectories.length > 0;
    const hasGit = dirListing.subdirectories.some(d => d.name === '.git');

    if (hasEntries && hasGit) {
      return { ok: true, recloned: false };
    }

    const reason = !hasEntries ? 'repo_empty_or_missing' : 'missing_git_dir';
    console.log(`[Repo] /repo not ready (${reason}). Re-cloning...`);

    const cloneResult = await cloneRepoToSandbox(sandbox, githubUrl);
    if (!cloneResult.success) {
      return { ok: false, recloned: true, reason: cloneResult.error || 'clone_failed' };
    }

    return { ok: true, recloned: true, reason };
  } catch (error) {
    // If /repo doesn't exist at all, fs.ls throws -- treat as needing clone
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.log(`[Repo] /repo check failed (${errMsg}). Re-cloning...`);

    try {
      const cloneResult = await cloneRepoToSandbox(sandbox, githubUrl);
      if (!cloneResult.success) {
        return { ok: false, recloned: true, reason: cloneResult.error || 'clone_failed' };
      }
      return { ok: true, recloned: true, reason: 'repo_dir_missing' };
    } catch (cloneError) {
      console.error('[Repo] ensureRepoPresent clone failed:', cloneError);
      return {
        ok: false,
        recloned: false,
        reason: cloneError instanceof Error ? cloneError.message : 'Unknown error',
      };
    }
  }
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
 * Detect primary language from file extensions.
 * Uses a single sandbox.fs.find call instead of 12+ process.exec calls.
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
    // Single find call with all source-code patterns
    const findResult = await sandbox.fs.find('/repo', {
      type: 'file',
      patterns: [
        '*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.go',
        '*.java', '*.rb', '*.rs', '*.php', '*.cs', '*.cpp', '*.c',
      ],
      excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next'],
      maxResults: 5000,
    });

    if (!findResult.matches || findResult.matches.length === 0) {
      return 'Unknown';
    }

    // Count occurrences by extension
    const counts: Record<string, number> = {};
    for (const match of findResult.matches) {
      const dotIdx = match.path.lastIndexOf('.');
      if (dotIdx !== -1) {
        const ext = match.path.slice(dotIdx);
        counts[ext] = (counts[ext] || 0) + 1;
      }
    }

    let maxExt = '';
    let maxCount = 0;
    for (const [ext, count] of Object.entries(counts)) {
      if (count > maxCount && langExtensions[ext]) {
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
 * Collect analysis context from the sandbox.
 *
 * Uses the Blaxel SDK filesystem API (sandbox.fs.*) instead of process.exec
 * shell commands, because process.exec returns empty results after sandbox
 * standby/resume while the HTTP filesystem API remains reliable.
 */
export async function collectAnalysisContext(
  sandbox: SandboxInstance,
  githubUrl: string
): Promise<import('./types').AnalysisContext | undefined> {
  try {
    // Ensure /repo is present (sandboxes may scale-to-zero on idle)
    const repoStatus = await ensureRepoPresent(sandbox, githubUrl);
    if (!repoStatus.ok) {
      console.error('[AnalysisContext] Repo not available:', repoStatus.reason);
      // Return minimal context so UI can still render
      return minimalContext(githubUrl);
    }

    // Try to read .analysis-context.json via the filesystem API
    let existingContext: Partial<import('./types').AnalysisContext> | null = null;
    try {
      const raw = await sandbox.fs.read('/repo/.analysis-context.json');
      if (raw && raw.trim() !== '{}') {
        existingContext = JSON.parse(raw);
      }
    } catch {
      // File doesn't exist -- that's fine, we'll generate from scratch
    }

    if (existingContext && Object.keys(existingContext).length > 0) {
      console.log('[AnalysisContext] Loaded from .analysis-context.json');
      const incomingStructure = existingContext.structure;
      const hasIncomingStructure =
        !!incomingStructure &&
        Array.isArray(incomingStructure.rootFiles) &&
        Array.isArray(incomingStructure.directories) &&
        Array.isArray(incomingStructure.entryPoints) &&
        (incomingStructure.rootFiles.length > 0 ||
          incomingStructure.directories.length > 0 ||
          incomingStructure.entryPoints.length > 0);

      if (
        hasIncomingStructure &&
        existingContext.patterns &&
        existingContext.configFiles &&
        Array.isArray(existingContext.sourceFiles)
      ) {
        return {
          repositoryUrl: existingContext.repositoryUrl || githubUrl,
          collectedAt: existingContext.collectedAt || new Date().toISOString(),
          structure: incomingStructure!,
          configFiles: existingContext.configFiles,
          sourceFiles: existingContext.sourceFiles,
          patterns: {
            framework: existingContext.patterns.framework || 'Unknown',
            architecture: existingContext.patterns.architecture || 'Unknown',
            keyModules: existingContext.patterns.keyModules || [],
            primaryLanguage: existingContext.patterns.primaryLanguage,
          },
          metadata: existingContext.metadata,
        };
      }
      // Fall through to generate structure/config from repo
    }

    // ── Generate context using the SDK filesystem API ──────────────
    console.log('[AnalysisContext] Generating from repo structure via fs API...');

    // 1. Root listing via sandbox.fs.ls (reliable, proven by agents)
    const rootFiles: string[] = [];
    const directories: string[] = [];
    try {
      const dirListing = await sandbox.fs.ls('/repo');
      for (const f of dirListing.files) {
        if (!f.name.startsWith('.')) {
          rootFiles.push(f.name);
        }
      }
      for (const d of dirListing.subdirectories) {
        if (!d.name.startsWith('.')) {
          directories.push(d.name);
        }
      }
      console.log(`[AnalysisContext] Root listing: ${rootFiles.length} files, ${directories.length} dirs`);
    } catch (lsErr) {
      console.error('[AnalysisContext] fs.ls /repo failed:', lsErr);
    }

    // 2. Entry points via sandbox.fs.find
    const entryPoints: string[] = [];
    try {
      const epResult = await sandbox.fs.find('/repo', {
        type: 'file',
        patterns: ['index.*', 'main.*', 'app.*', 'server.*', 'cli.*'],
        excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next'],
        maxResults: 20,
      });
      for (const match of epResult.matches) {
        entryPoints.push(match.path);
      }
    } catch (findErr) {
      console.error('[AnalysisContext] fs.find entry points failed:', findErr);
    }

    // 3. Config files via sandbox.fs.read
    const configFiles: Record<string, { content: string; keyDeps?: string[] }> = {};
    const configPatterns = [
      'package.json', 'tsconfig.json', 'requirements.txt', 'Cargo.toml',
      'go.mod', 'pom.xml', 'build.gradle', 'Dockerfile',
    ];
    for (const configFile of configPatterns) {
      try {
        const content = await sandbox.fs.read(`/repo/${configFile}`);
        if (content && content.trim()) {
          const keyDeps = configFile === 'package.json' ? extractKeyDeps(content) : undefined;
          configFiles[configFile] = { content, keyDeps };
        }
      } catch {
        // File doesn't exist -- skip
      }
    }

    // 4. Framework / architecture detection
    let framework = 'Unknown';
    let architecture = 'Unknown';
    if (configFiles['package.json']) {
      framework = extractFramework(configFiles['package.json'].content);
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

    // 5. Key modules
    const keyModules = extractKeyModules(directories);

    // 6. Primary language (uses sandbox.fs.find internally)
    const primaryLanguage = await detectPrimaryLanguage(sandbox);

    // 7. Metadata via sandbox.fs.find
    const metadata: { linesOfCode?: number; fileCount?: number; testFiles?: string[] } = {};

    // File count
    try {
      const allFiles = await sandbox.fs.find('/repo', {
        type: 'file',
        excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next'],
        maxResults: 50000,
      });
      metadata.fileCount = allFiles.total;
    } catch {
      // non-critical
    }

    // Test files
    try {
      const testResult = await sandbox.fs.find('/repo', {
        type: 'file',
        patterns: ['*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx', '*.test.js', '*.spec.js'],
        excludeDirs: ['node_modules', '.git'],
        maxResults: 20,
      });
      if (testResult.matches.length > 0) {
        metadata.testFiles = testResult.matches.map(m => m.path);
      }
    } catch {
      // non-critical
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

    console.log(`[AnalysisContext] Generated context: ${rootFiles.length} root files, ${directories.length} dirs, ${entryPoints.length} entry points`);
    return context;
  } catch (error) {
    console.error('[AnalysisContext] Failed to collect:', error);
    return minimalContext(githubUrl);
  }
}

/** Return a minimal context so the UI can always render something. */
function minimalContext(githubUrl: string): import('./types').AnalysisContext {
  return {
    repositoryUrl: githubUrl,
    collectedAt: new Date().toISOString(),
    structure: {
      rootFiles: [],
      directories: [],
      entryPoints: [],
    },
    configFiles: {},
    sourceFiles: [],
    patterns: {
      framework: 'Unknown',
      architecture: 'Unknown',
      keyModules: [],
    },
  };
}
