// Cost tracking and estimation utilities for hybrid model strategy

export interface CostBreakdown {
  model: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  inputCost: number;
  outputCost: number;
  cacheDiscount: number;
  totalCost: number;
}

export interface AnalysisMetrics {
  jobId: string;
  phase1: CostBreakdown | null;
  phase2: CostBreakdown | null;
  fallback: CostBreakdown | null;
  totalCost: number;
  retryOccurred: boolean;
  phase1Success: boolean;
  phase2Success: boolean;
  durationMs: number;
  startTime: Date;
  endTime?: Date;
}

// Anthropic pricing per 1M tokens (as of Feb 2026)
const PRICING = {
  'claude-haiku-4-5-20251001': {
    input: 0.80,
    output: 4.00,
    cacheDiscount: 0.90, // 90% discount on cached tokens
  },
  'claude-sonnet-4-5-20250514': {
    input: 3.00,
    output: 15.00,
    cacheDiscount: 0.90,
  },
} as const;

// Estimate tokens from text (rough approximation: ~4 chars per token)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Calculate cost breakdown for a model interaction
export function calculateCost(
  model: keyof typeof PRICING,
  inputText: string,
  outputText: string,
  cachedInputText: string = ''
): CostBreakdown {
  const pricing = PRICING[model];
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(outputText);
  const cachedTokens = estimateTokens(cachedInputText);
  
  // Calculate costs (per 1M tokens)
  const uncachedInputTokens = inputTokens - cachedTokens;
  const inputCost = (uncachedInputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  
  // Cache discount applies to cached portion of input
  const cacheDiscount = (cachedTokens / 1_000_000) * pricing.input * pricing.cacheDiscount;
  
  return {
    model,
    modelName: model === 'claude-haiku-4-5-20251001' ? 'Haiku 4.5' : 'Sonnet 4.5',
    inputTokens,
    outputTokens,
    cachedTokens,
    inputCost,
    outputCost,
    cacheDiscount,
    totalCost: inputCost + outputCost - cacheDiscount,
  };
}

// Initialize metrics for a new analysis job
export function createMetrics(jobId: string): AnalysisMetrics {
  return {
    jobId,
    phase1: null,
    phase2: null,
    fallback: null,
    totalCost: 0,
    retryOccurred: false,
    phase1Success: false,
    phase2Success: false,
    durationMs: 0,
    startTime: new Date(),
  };
}

// Update phase 1 metrics
export function updatePhase1Metrics(
  metrics: AnalysisMetrics,
  inputText: string,
  outputText: string,
  cachedText: string = ''
): void {
  metrics.phase1 = calculateCost(
    'claude-haiku-4-5-20251001',
    inputText,
    outputText,
    cachedText
  );
  metrics.phase1Success = true;
  recalculateTotal(metrics);
}

// Update phase 2 metrics
export function updatePhase2Metrics(
  metrics: AnalysisMetrics,
  inputText: string,
  outputText: string,
  cachedText: string = ''
): void {
  metrics.phase2 = calculateCost(
    'claude-sonnet-4-5-20250514',
    inputText,
    outputText,
    cachedText
  );
  metrics.phase2Success = true;
  recalculateTotal(metrics);
}

// Update fallback metrics (when phase 1 fails)
export function updateFallbackMetrics(
  metrics: AnalysisMetrics,
  inputText: string,
  outputText: string,
  cachedText: string = ''
): void {
  metrics.fallback = calculateCost(
    'claude-sonnet-4-5-20250514',
    inputText,
    outputText,
    cachedText
  );
  metrics.retryOccurred = true;
  metrics.phase2Success = true;
  recalculateTotal(metrics);
}

// Recalculate total cost from all phases
function recalculateTotal(metrics: AnalysisMetrics): void {
  metrics.totalCost = 
    (metrics.phase1?.totalCost || 0) +
    (metrics.phase2?.totalCost || 0) +
    (metrics.fallback?.totalCost || 0);
}

// Mark analysis as complete
export function finalizeMetrics(metrics: AnalysisMetrics): void {
  metrics.endTime = new Date();
  metrics.durationMs = metrics.endTime.getTime() - metrics.startTime.getTime();
}

// Format metrics for logging
export function formatMetrics(metrics: AnalysisMetrics): string {
  const lines = [
    `\n=== Cost Analysis: ${metrics.jobId} ===`,
    `Duration: ${(metrics.durationMs / 1000).toFixed(1)}s`,
    `Retry: ${metrics.retryOccurred ? 'YES' : 'No'}`,
  ];

  if (metrics.phase1) {
    lines.push(
      `\nPhase 1 (Haiku 4.5):`,
      `  Tokens: ${metrics.phase1.inputTokens.toLocaleString()} in / ${metrics.phase1.outputTokens.toLocaleString()} out`,
      `  Cached: ${metrics.phase1.cachedTokens.toLocaleString()} tokens (-${metrics.phase1.cacheDiscount.toFixed(4)})`,
      `  Cost: $${metrics.phase1.totalCost.toFixed(4)}`
    );
  }

  if (metrics.phase2) {
    lines.push(
      `\nPhase 2 (Sonnet 4.5):`,
      `  Tokens: ${metrics.phase2.inputTokens.toLocaleString()} in / ${metrics.phase2.outputTokens.toLocaleString()} out`,
      `  Cached: ${metrics.phase2.cachedTokens.toLocaleString()} tokens (-${metrics.phase2.cacheDiscount.toFixed(4)})`,
      `  Cost: $${metrics.phase2.totalCost.toFixed(4)}`
    );
  }

  if (metrics.fallback) {
    lines.push(
      `\nFallback (Sonnet 4.5 Full):`,
      `  Tokens: ${metrics.fallback.inputTokens.toLocaleString()} in / ${metrics.fallback.outputTokens.toLocaleString()} out`,
      `  Cached: ${metrics.fallback.cachedTokens.toLocaleString()} tokens (-${metrics.fallback.cacheDiscount.toFixed(4)})`,
      `  Cost: $${metrics.fallback.totalCost.toFixed(4)}`
    );
  }

  lines.push(
    `\nTotal Cost: $${metrics.totalCost.toFixed(4)}`,
    `Target: $0.40-$0.60 | ${metrics.totalCost <= 0.60 ? '✅ ON TARGET' : metrics.totalCost <= 1.00 ? '⚠️ ACCEPTABLE' : '❌ OVER BUDGET'}`,
    `================================\n`
  );

  return lines.join('\n');
}

// Export metrics as JSON for logging/analysis
export function exportMetrics(metrics: AnalysisMetrics): Record<string, unknown> {
  return {
    jobId: metrics.jobId,
    durationMs: metrics.durationMs,
    retryOccurred: metrics.retryOccurred,
    phase1Success: metrics.phase1Success,
    phase2Success: metrics.phase2Success,
    totalCost: metrics.totalCost,
    phase1: metrics.phase1 ? {
      model: metrics.phase1.model,
      inputTokens: metrics.phase1.inputTokens,
      outputTokens: metrics.phase1.outputTokens,
      cachedTokens: metrics.phase1.cachedTokens,
      cost: metrics.phase1.totalCost,
    } : null,
    phase2: metrics.phase2 ? {
      model: metrics.phase2.model,
      inputTokens: metrics.phase2.inputTokens,
      outputTokens: metrics.phase2.outputTokens,
      cachedTokens: metrics.phase2.cachedTokens,
      cost: metrics.phase2.totalCost,
    } : null,
    fallback: metrics.fallback ? {
      model: metrics.fallback.model,
      inputTokens: metrics.fallback.inputTokens,
      outputTokens: metrics.fallback.outputTokens,
      cachedTokens: metrics.fallback.cachedTokens,
      cost: metrics.fallback.totalCost,
    } : null,
  };
}