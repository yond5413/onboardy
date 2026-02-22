'use client';

import { OwnerBadge, OwnerList } from '@/components/owner-badge';
import type { ComponentOwnership, OwnerInfo } from '@/app/lib/agent';
import { Users, X } from 'lucide-react';

interface NodeOwnersPanelProps {
  componentOwnership?: ComponentOwnership;
  globalOwners: OwnerInfo[];
  onClose: () => void;
}

export function NodeOwnersPanel({ componentOwnership, globalOwners, onClose }: NodeOwnersPanelProps) {
  if (!componentOwnership) {
    return null;
  }

  const { componentLabel, owners, keyFiles } = componentOwnership;

  return (
    <div className="absolute top-4 right-4 z-10 w-80 bg-background border rounded-lg shadow-lg">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span className="font-semibold text-sm">Who owns {componentLabel}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      <div className="p-3 space-y-4 max-h-96 overflow-y-auto">
        {keyFiles && keyFiles.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Key Files</h4>
            <div className="space-y-1">
              {keyFiles.slice(0, 5).map((file, i) => (
                <div key={i} className="text-xs font-mono text-muted-foreground truncate">
                  {file}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            Component Owners ({owners.length})
          </h4>
          {owners.length > 0 ? (
            <div className="space-y-2">
              {owners.map((owner, i) => (
                <OwnerBadge key={i} owner={owner} size="sm" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No specific owners for this component</p>
          )}
        </div>

        <div className="border-t pt-3">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            All Contributors ({globalOwners.length})
          </h4>
          <OwnerList owners={globalOwners} maxDisplay={3} />
        </div>
      </div>
    </div>
  );
}
