'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import type { OwnerInfo } from '@/app/lib/agent';
import { User, Mail, Calendar, GitCommit } from 'lucide-react';

interface OwnerBadgeProps {
  owner: OwnerInfo;
  showEmail?: boolean;
  size?: 'sm' | 'md';
}

export function OwnerBadge({ owner, showEmail = false, size = 'md' }: OwnerBadgeProps) {
  const initials = owner.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const confidenceColor = owner.confidence >= 0.7 
    ? 'bg-green-500' 
    : owner.confidence >= 0.4 
      ? 'bg-yellow-500' 
      : 'bg-gray-500';

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const content = (
    <div className={`flex items-center gap-2 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      <Avatar className={`${size === 'sm' ? 'h-6 w-6' : 'h-8 w-8'}`}>
        <AvatarFallback className={`${size === 'sm' ? 'text-xs' : 'text-sm'} bg-primary/10`}>
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <span className="font-medium">{owner.name}</span>
        {showEmail && (
          <span className="text-muted-foreground text-xs">{owner.email}</span>
        )}
      </div>
      <Badge 
        variant="secondary" 
        className={`${size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs'} ml-1`}
      >
        {Math.round(owner.confidence * 100)}%
      </Badge>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="right" className="w-64">
          <div className="space-y-3 p-2">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${confidenceColor}`} />
              <span className="font-semibold">
                {Math.round(owner.confidence * 100)}% confidence
              </span>
            </div>
            
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <GitCommit className="h-3 w-3" />
                <span>{owner.commitCount} total commits</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>{owner.recentCommitCount} commits in last 90 days</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>Last commit: {formatDate(owner.lastCommitDate)}</span>
              </div>
            </div>

            <div className="border-t pt-2">
              <p className="text-xs font-medium mb-1">Why this owner?</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {owner.reasons.slice(0, 3).map((reason, i) => (
                  <li key={i}>• {reason}</li>
                ))}
              </ul>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface OwnerListProps {
  owners: OwnerInfo[];
  maxDisplay?: number;
  showEmail?: boolean;
}

export function OwnerList({ owners, maxDisplay = 5, showEmail = false }: OwnerListProps) {
  if (!owners || owners.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No owners found</p>
    );
  }

  const displayOwners = owners.slice(0, maxDisplay);
  const remainingCount = owners.length - maxDisplay;

  return (
    <div className="space-y-2">
      {displayOwners.map((owner, index) => (
        <OwnerBadge key={index} owner={owner} showEmail={showEmail} size="sm" />
      ))}
      {remainingCount > 0 && (
        <p className="text-xs text-muted-foreground">
          +{remainingCount} more owners
        </p>
      )}
    </div>
  );
}
