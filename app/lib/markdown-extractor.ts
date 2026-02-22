/**
 * Markdown Layer Extractor
 * Separates layered markdown output into audience-specific documents
 */

export interface LayeredMarkdown {
  full: string; // Complete layered document
  executiveSummary: string; // Layer 1: For non-technical stakeholders
  technicalDeepDive: string; // Layer 3: For experienced developers
}

/**
 * Extract layer 1 (Executive Summary) from layered markdown
 * Returns content from "LAYER 1" up to "LAYER 2"
 */
export function extractExecutiveSummary(markdown: string): string {
  try {
    const layer1Start = markdown.indexOf('LAYER 1:');
    const layer2Start = markdown.indexOf('LAYER 2:');

    if (layer1Start === -1) {
      return ''; // Layer markers not found
    }

    let end = layer2Start !== -1 ? layer2Start : markdown.length;
    let summary = markdown.substring(layer1Start, end).trim();

    // Remove the layer marker line completely (handles #### **LAYER 1: TITLE** format)
    summary = summary.replace(/^.*LAYER 1:.*$/m, '').trim();
    
    // Remove trailing layer 2 marker if present
    summary = summary.replace(/^.*LAYER 2:.*$/m, '').trim();
    
    // Remove horizontal rules (---)
    summary = summary.replace(/^---+$/gm, '').trim();
    
    return summary;
  } catch (error) {
    console.error('Failed to extract executive summary:', error);
    return '';
  }
}

/**
 * Extract layer 3 (Technical Deep Dive) from layered markdown
 * Returns content from "LAYER 3" onwards
 */
export function extractTechnicalDeepDive(markdown: string): string {
  try {
    const layer3Start = markdown.indexOf('LAYER 3:');

    if (layer3Start === -1) {
      return ''; // Layer marker not found
    }

    let deepDive = markdown.substring(layer3Start).trim();

    // Remove the layer marker line completely (handles #### **LAYER 3: TITLE** format)
    deepDive = deepDive.replace(/^.*LAYER 3:.*$/m, '').trim();
    
    // Remove horizontal rules
    deepDive = deepDive.replace(/^---+$/gm, '').trim();
    
    return deepDive;
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
    technicalDeepDive: extractTechnicalDeepDive(markdown),
  };
}

/**
 * Validate that markdown contains expected layers
 */
export function validateLayeredMarkdown(markdown: string): {
  valid: boolean;
  haslayer1: boolean;
  hasLayer2: boolean;
  hasLayer3: boolean;
  missingLayers: string[];
} {
  const hasLayer1 = markdown.includes('LAYER 1:');
  const hasLayer2 = markdown.includes('LAYER 2:');
  const hasLayer3 = markdown.includes('LAYER 3:');

  const missingLayers: string[] = [];
  if (!hasLayer1) missingLayers.push('Layer 1 (Executive Summary)');
  if (!hasLayer2) missingLayers.push('Layer 2 (Developer Onboarding)');
  if (!hasLayer3) missingLayers.push('Layer 3 (Technical Deep Dive)');

  return {
    valid: hasLayer1 && hasLayer2 && hasLayer3,
    haslayer1: hasLayer1,
    hasLayer2,
    hasLayer3,
    missingLayers,
  };
}
