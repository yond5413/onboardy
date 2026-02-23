/**
 * Markdown Layer Extractor
 * Separates layered markdown output into audience-specific documents
 * 
 * Uses robust regex matching to handle LLM formatting variations:
 *   ## LAYER 1: TITLE
 *   ## **LAYER 1: TITLE**
 *   #### LAYER 1: TITLE
 *   ## Layer 1: TITLE
 */

export interface LayeredMarkdown {
  full: string; // Complete layered document
  executiveSummary: string; // Layer 1: For non-technical stakeholders
  developerOnboarding: string; // Layer 2: For newbie developers
  technicalDeepDive: string; // Layer 3: For experienced developers
}

/**
 * Build a case-insensitive regex that finds a LAYER N marker line.
 * Handles: ## LAYER 1:, #### **LAYER 1: ...**,  ## layer 1:, etc.
 */
function layerMarkerRegex(n: number): RegExp {
  // Match optional markdown heading prefix, optional bold markers, 
  // the LAYER N: text (case-insensitive), and any trailing text on the same line
  return new RegExp(`^#{1,6}\\s*\\*{0,2}\\s*layer\\s+${n}\\s*[:.].*$`, 'im');
}

/**
 * Find the character index where a layer marker starts.
 * Returns -1 if not found.
 */
function findLayerStart(markdown: string, layerNumber: number): number {
  const match = markdown.match(layerMarkerRegex(layerNumber));
  if (!match || match.index === undefined) return -1;
  return match.index;
}

/**
 * Strip the layer marker heading line and surrounding horizontal rules from extracted content.
 */
function cleanLayerContent(content: string, layerNumber: number): string {
  let cleaned = content;

  // Remove the layer marker heading line itself
  cleaned = cleaned.replace(layerMarkerRegex(layerNumber), '').trim();

  // Remove horizontal rules (---)
  cleaned = cleaned.replace(/^---+$/gm, '').trim();

  return cleaned;
}

/**
 * Extract layer 1 (Executive Summary) from layered markdown
 * Returns content from "LAYER 1" up to "LAYER 2"
 */
export function extractExecutiveSummary(markdown: string): string {
  try {
    const layer1Start = findLayerStart(markdown, 1);
    if (layer1Start === -1) return '';

    const layer2Start = findLayerStart(markdown, 2);
    const end = layer2Start !== -1 ? layer2Start : markdown.length;

    const raw = markdown.substring(layer1Start, end).trim();
    return cleanLayerContent(raw, 1);
  } catch (error) {
    console.error('Failed to extract executive summary:', error);
    return '';
  }
}

/**
 * Extract layer 2 (Developer Onboarding) from layered markdown
 * Returns content from "LAYER 2" up to "LAYER 3"
 */
export function extractDeveloperOnboarding(markdown: string): string {
  try {
    const layer2Start = findLayerStart(markdown, 2);
    if (layer2Start === -1) return '';

    const layer3Start = findLayerStart(markdown, 3);
    const end = layer3Start !== -1 ? layer3Start : markdown.length;

    const raw = markdown.substring(layer2Start, end).trim();
    return cleanLayerContent(raw, 2);
  } catch (error) {
    console.error('Failed to extract developer onboarding:', error);
    return '';
  }
}

/**
 * Extract layer 3 (Technical Deep Dive) from layered markdown
 * Returns content from "LAYER 3" onwards
 */
export function extractTechnicalDeepDive(markdown: string): string {
  try {
    const layer3Start = findLayerStart(markdown, 3);
    if (layer3Start === -1) return '';

    const raw = markdown.substring(layer3Start).trim();
    return cleanLayerContent(raw, 3);
  } catch (error) {
    console.error('Failed to extract technical deep dive:', error);
    return '';
  }
}

/**
 * Parse complete layered markdown into separate documents
 */
export function extractLayeredMarkdown(markdown: string): LayeredMarkdown {
  return {
    full: markdown,
    executiveSummary: extractExecutiveSummary(markdown),
    developerOnboarding: extractDeveloperOnboarding(markdown),
    technicalDeepDive: extractTechnicalDeepDive(markdown),
  };
}

/**
 * Validate that markdown contains expected layers
 */
export function validateLayeredMarkdown(markdown: string): {
  valid: boolean;
  hasLayer1: boolean;
  hasLayer2: boolean;
  hasLayer3: boolean;
  missingLayers: string[];
} {
  const hasLayer1 = findLayerStart(markdown, 1) !== -1;
  const hasLayer2 = findLayerStart(markdown, 2) !== -1;
  const hasLayer3 = findLayerStart(markdown, 3) !== -1;

  const missingLayers: string[] = [];
  if (!hasLayer1) missingLayers.push('Layer 1 (Executive Summary)');
  if (!hasLayer2) missingLayers.push('Layer 2 (Developer Onboarding)');
  if (!hasLayer3) missingLayers.push('Layer 3 (Technical Deep Dive)');

  return {
    valid: hasLayer1 && hasLayer2 && hasLayer3,
    hasLayer1,
    hasLayer2,
    hasLayer3,
    missingLayers,
  };
}
