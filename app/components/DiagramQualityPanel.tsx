'use client';

import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DiagramQualityReport } from '@/app/lib/diagram-quality';

interface DiagramQualityPanelProps {
  report: DiagramQualityReport;
  className?: string;
}

function getLevelLabel(level: DiagramQualityReport['level']): string {
  switch (level) {
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    default:
      return 'Poor';
  }
}

function getLevelClasses(level: DiagramQualityReport['level']): string {
  switch (level) {
    case 'good':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    case 'fair':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    default:
      return 'bg-red-500/10 text-red-500 border-red-500/20';
  }
}

function getWarningIcon(level: DiagramQualityReport['level']) {
  if (level === 'good') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (level === 'fair') return <Info className="h-4 w-4 text-yellow-500" />;
  return <AlertTriangle className="h-4 w-4 text-red-500" />;
}

export function DiagramQualityPanel({ report, className = '' }: DiagramQualityPanelProps) {
  const topWarnings = report.warnings.slice(0, 4);

  return (
    <div className={`rounded-lg border bg-muted/30 p-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {getWarningIcon(report.level)}
          <p className="text-sm font-medium">Diagram quality</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={getLevelClasses(report.level)}>
            {getLevelLabel(report.level)}
          </Badge>
          <Badge variant="secondary">{report.score}/100</Badge>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
        <div>Nodes: <span className="text-foreground">{report.metrics.nodeCount}</span></div>
        <div>Edges: <span className="text-foreground">{report.metrics.edgeCount}</span></div>
        <div>Overlap risk: <span className="text-foreground">{report.metrics.overlapRiskCount}</span></div>
        <div>Crossing risk: <span className="text-foreground">{report.metrics.edgeCrossingRiskCount}</span></div>
      </div>

      {topWarnings.length > 0 && (
        <ul className="mt-3 space-y-1">
          {topWarnings.map((warning) => (
            <li key={warning.code} className="text-xs text-muted-foreground">
              - {warning.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
