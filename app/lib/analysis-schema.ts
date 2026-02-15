// JSON Schema for Phase 1 output validation
export const AnalysisContextSchema = {
  type: 'object',
  required: ['repositoryUrl', 'collectedAt', 'structure', 'configFiles', 'sourceFiles', 'patterns'],
  properties: {
    repositoryUrl: { type: 'string', format: 'uri' },
    collectedAt: { type: 'string', format: 'date-time' },
    structure: {
      type: 'object',
      required: ['rootFiles', 'directories', 'entryPoints'],
      properties: {
        rootFiles: { type: 'array', items: { type: 'string' } },
        directories: { type: 'array', items: { type: 'string' } },
        entryPoints: { type: 'array', items: { type: 'string' } },
      },
    },
    configFiles: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          keyDeps: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    sourceFiles: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'summary'],
        properties: {
          path: { type: 'string' },
          summary: { type: 'string' },
          imports: { type: 'array', items: { type: 'string' } },
          exports: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    patterns: {
      type: 'object',
      required: ['framework', 'architecture', 'keyModules'],
      properties: {
        framework: { type: 'string' },
        architecture: { type: 'string' },
        keyModules: { type: 'array', items: { type: 'string' } },
      },
    },
    metadata: {
      type: 'object',
      properties: {
        linesOfCode: { type: 'number' },
        fileCount: { type: 'number' },
        testFiles: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const;

export type AnalysisContext = {
  repositoryUrl: string;
  collectedAt: string;
  structure: {
    rootFiles: string[];
    directories: string[];
    entryPoints: string[];
  };
  configFiles: Record<string, {
    content: string;
    keyDeps?: string[];
  }>;
  sourceFiles: Array<{
    path: string;
    summary: string;
    imports?: string[];
    exports?: string[];
  }>;
  patterns: {
    framework: string;
    architecture: string;
    keyModules: string[];
  };
  metadata?: {
    linesOfCode?: number;
    fileCount?: number;
    testFiles?: string[];
  };
};

// Validate JSON against schema (simple implementation)
export function validateAnalysisContext(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data must be an object'] };
  }

  const obj = data as Record<string, unknown>;

  // Check required fields
  const required = ['repositoryUrl', 'collectedAt', 'structure', 'configFiles', 'sourceFiles', 'patterns'];
  for (const field of required) {
    if (!(field in obj)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate structure
  if (obj.structure && typeof obj.structure === 'object') {
    const structure = obj.structure as Record<string, unknown>;
    if (!Array.isArray(structure.rootFiles)) {
      errors.push('structure.rootFiles must be an array');
    }
    if (!Array.isArray(structure.directories)) {
      errors.push('structure.directories must be an array');
    }
    if (!Array.isArray(structure.entryPoints)) {
      errors.push('structure.entryPoints must be an array');
    }
  }

  // Validate sourceFiles
  if (obj.sourceFiles && Array.isArray(obj.sourceFiles)) {
    for (let i = 0; i < obj.sourceFiles.length; i++) {
      const file = obj.sourceFiles[i] as Record<string, unknown>;
      if (!file.path || typeof file.path !== 'string') {
        errors.push(`sourceFiles[${i}].path must be a string`);
      }
      if (!file.summary || typeof file.summary !== 'string') {
        errors.push(`sourceFiles[${i}].summary must be a string`);
      }
    }
  }

  // Validate patterns
  if (obj.patterns && typeof obj.patterns === 'object') {
    const patterns = obj.patterns as Record<string, unknown>;
    if (!patterns.framework || typeof patterns.framework !== 'string') {
      errors.push('patterns.framework must be a string');
    }
    if (!patterns.architecture || typeof patterns.architecture !== 'string') {
      errors.push('patterns.architecture must be a string');
    }
    if (!Array.isArray(patterns.keyModules)) {
      errors.push('patterns.keyModules must be an array');
    }
  }

  return { valid: errors.length === 0, errors };
}