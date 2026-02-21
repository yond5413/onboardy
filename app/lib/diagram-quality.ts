import type { ReactFlowEdge, ReactFlowNode } from '@/app/lib/types';

export type DiagramQualitySeverity = 'info' | 'warning' | 'critical';
export type DiagramQualityLevel = 'good' | 'fair' | 'poor';

export interface DiagramQualityWarning {
  code:
    | 'node-overlap-risk'
    | 'edge-crossing-risk'
    | 'dense-layout'
    | 'label-verbosity'
    | 'isolated-nodes'
    | 'unbalanced-flow';
  severity: DiagramQualitySeverity;
  message: string;
}

export interface DiagramQualityMetrics {
  nodeCount: number;
  edgeCount: number;
  averageDegree: number;
  overlapRiskCount: number;
  edgeCrossingRiskCount: number;
  isolatedNodeCount: number;
  longLabelCount: number;
  densityScore: number;
}

export interface DiagramQualityReport {
  score: number;
  level: DiagramQualityLevel;
  warnings: DiagramQualityWarning[];
  metrics: DiagramQualityMetrics;
}

interface NodeBox {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

const NODE_WIDTH_BASE = 180;
const NODE_WIDTH_PER_CHAR = 2.2;
const NODE_HEIGHT_BASE = 74;
const NODE_HEIGHT_PER_LINE = 14;
const MIN_COLUMN_GAP = 120;
const LONG_LABEL_THRESHOLD = 34;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getLabelText(node: ReactFlowNode): string {
  const label = node.data?.label;
  return typeof label === 'string' ? label : '';
}

function estimateNodeBox(node: ReactFlowNode): NodeBox {
  const label = getLabelText(node);
  const description =
    typeof node.data?.description === 'string' ? node.data.description : '';

  const estimatedWidth = clamp(
    NODE_WIDTH_BASE + label.length * NODE_WIDTH_PER_CHAR,
    150,
    360
  );

  const lines = Math.max(1, Math.ceil(description.length / 44));
  const estimatedHeight = clamp(
    NODE_HEIGHT_BASE + lines * NODE_HEIGHT_PER_LINE,
    60,
    190
  );

  const x = node.position?.x ?? 0;
  const y = node.position?.y ?? 0;

  return {
    id: node.id,
    left: x - estimatedWidth / 2,
    right: x + estimatedWidth / 2,
    top: y - estimatedHeight / 2,
    bottom: y + estimatedHeight / 2,
    centerX: x,
    centerY: y,
  };
}

function boxesOverlap(a: NodeBox, b: NodeBox): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) < 0.00001) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(
  a1x: number,
  a1y: number,
  a2x: number,
  a2y: number,
  b1x: number,
  b1y: number,
  b2x: number,
  b2y: number
): boolean {
  const o1 = orientation(a1x, a1y, a2x, a2y, b1x, b1y);
  const o2 = orientation(a1x, a1y, a2x, a2y, b2x, b2y);
  const o3 = orientation(b1x, b1y, b2x, b2y, a1x, a1y);
  const o4 = orientation(b1x, b1y, b2x, b2y, a2x, a2y);

  return o1 !== o2 && o3 !== o4;
}

function deriveQualityLevel(score: number): DiagramQualityLevel {
  if (score >= 80) return 'good';
  if (score >= 60) return 'fair';
  return 'poor';
}

export function evaluateArchitectureDiagramQuality(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[]
): DiagramQualityReport {
  if (!nodes.length) {
    return {
      score: 0,
      level: 'poor',
      warnings: [
        {
          code: 'dense-layout',
          severity: 'critical',
          message: 'No nodes found in architecture diagram.',
        },
      ],
      metrics: {
        nodeCount: 0,
        edgeCount: 0,
        averageDegree: 0,
        overlapRiskCount: 0,
        edgeCrossingRiskCount: 0,
        isolatedNodeCount: 0,
        longLabelCount: 0,
        densityScore: 1,
      },
    };
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const boxes = nodes.map((node) => estimateNodeBox(node));

  let overlapRiskCount = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (boxesOverlap(boxes[i], boxes[j])) overlapRiskCount += 1;
    }
  }

  let edgeCrossingRiskCount = 0;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i];
      const b = edges[j];
      if (a.source === b.source || a.source === b.target || a.target === b.source || a.target === b.target) {
        continue;
      }
      const aSource = nodeMap.get(a.source);
      const aTarget = nodeMap.get(a.target);
      const bSource = nodeMap.get(b.source);
      const bTarget = nodeMap.get(b.target);
      if (!aSource || !aTarget || !bSource || !bTarget) continue;

      if (
        segmentsIntersect(
          aSource.position.x,
          aSource.position.y,
          aTarget.position.x,
          aTarget.position.y,
          bSource.position.x,
          bSource.position.y,
          bTarget.position.x,
          bTarget.position.y
        )
      ) {
        edgeCrossingRiskCount += 1;
      }
    }
  }

  const degrees = new Map<string, number>();
  for (const node of nodes) degrees.set(node.id, 0);
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
  }

  let isolatedNodeCount = 0;
  for (const degree of degrees.values()) {
    if (degree === 0) isolatedNodeCount += 1;
  }

  const longLabelCount = nodes.filter((node) => getLabelText(node).length > LONG_LABEL_THRESHOLD).length;
  const averageDegree = nodes.length > 0 ? (edges.length * 2) / nodes.length : 0;

  const xs = nodes.map((node) => node.position?.x ?? 0);
  const ys = nodes.map((node) => node.position?.y ?? 0);
  const width = Math.max(300, Math.max(...xs) - Math.min(...xs) + NODE_WIDTH_BASE);
  const height = Math.max(300, Math.max(...ys) - Math.min(...ys) + NODE_HEIGHT_BASE);
  const area = width * height;
  const densityScore = clamp((nodes.length * 10000) / area, 0, 1.2);

  let unbalancedFlowCount = 0;
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;
    if (target.position.x < source.position.x - MIN_COLUMN_GAP / 2) {
      unbalancedFlowCount += 1;
    }
  }

  const warnings: DiagramQualityWarning[] = [];
  if (overlapRiskCount > 0) {
    warnings.push({
      code: 'node-overlap-risk',
      severity: overlapRiskCount > 3 ? 'critical' : 'warning',
      message: `${overlapRiskCount} node overlap risk${overlapRiskCount === 1 ? '' : 's'} detected.`,
    });
  }
  if (edgeCrossingRiskCount > 0) {
    warnings.push({
      code: 'edge-crossing-risk',
      severity: edgeCrossingRiskCount > 6 ? 'critical' : 'warning',
      message: `${edgeCrossingRiskCount} likely edge crossing${edgeCrossingRiskCount === 1 ? '' : 's'} may reduce readability.`,
    });
  }
  if (densityScore > 0.52) {
    warnings.push({
      code: 'dense-layout',
      severity: densityScore > 0.8 ? 'critical' : 'warning',
      message: 'Node density is high for the visible canvas, which can feel crowded.',
    });
  }
  if (longLabelCount > 0) {
    warnings.push({
      code: 'label-verbosity',
      severity: longLabelCount > 4 ? 'warning' : 'info',
      message: `${longLabelCount} label${longLabelCount === 1 ? '' : 's'} are long and may create visual noise.`,
    });
  }
  if (isolatedNodeCount > 0) {
    warnings.push({
      code: 'isolated-nodes',
      severity: 'info',
      message: `${isolatedNodeCount} isolated node${isolatedNodeCount === 1 ? '' : 's'} have no visible connections.`,
    });
  }
  if (unbalancedFlowCount > 0) {
    warnings.push({
      code: 'unbalanced-flow',
      severity: unbalancedFlowCount > 2 ? 'warning' : 'info',
      message: `${unbalancedFlowCount} edge${unbalancedFlowCount === 1 ? '' : 's'} flow backward, which can hurt scanability.`,
    });
  }

  const penalty =
    overlapRiskCount * 10 +
    edgeCrossingRiskCount * 4 +
    isolatedNodeCount * 2 +
    longLabelCount * 2 +
    Math.round(clamp(densityScore - 0.35, 0, 1) * 25) +
    unbalancedFlowCount * 3;
  const score = clamp(100 - penalty, 0, 100);

  return {
    score,
    level: deriveQualityLevel(score),
    warnings,
    metrics: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      averageDegree,
      overlapRiskCount,
      edgeCrossingRiskCount,
      isolatedNodeCount,
      longLabelCount,
      densityScore,
    },
  };
}
