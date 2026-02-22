'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Headphones, Clock, Users, Mic } from 'lucide-react';
import type { PodcastSettings, PodcastDuration, PodcastTone, PodcastAudience } from '@/app/lib/script';
import { DURATION_WORDS } from '@/app/lib/script';

interface PodcastSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (settings: PodcastSettings) => void;
  isGenerating: boolean;
  existingSettings?: PodcastSettings;
}

export function PodcastSettingsModal({
  open,
  onOpenChange,
  onGenerate,
  isGenerating,
  existingSettings,
}: PodcastSettingsModalProps) {
  const [settings, setSettings] = useState<PodcastSettings>({
    style: existingSettings?.style || 'overview',
    duration: existingSettings?.duration || 'standard',
    tone: existingSettings?.tone || 'professional',
    audience: existingSettings?.audience || 'developer',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(settings);
  };

  const estimatedMinutes = DURATION_WORDS[settings.duration].minutes;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Headphones className="h-5 w-5" />
          Podcast Settings
        </CardTitle>
        <CardDescription>
          Configure your podcast generation options
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {/* Duration */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Duration
            </Label>
            <RadioGroup
              value={settings.duration}
              onValueChange={(value) => setSettings({ ...settings, duration: value as PodcastDuration })}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="quick" id="duration-quick" />
                <Label htmlFor="duration-quick" className="cursor-pointer">
                  Quick (~2 min)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="standard" id="duration-standard" />
                <Label htmlFor="duration-standard" className="cursor-pointer">
                  Standard (~5 min)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="detailed" id="duration-detailed" />
                <Label htmlFor="duration-detailed" className="cursor-pointer">
                  Detailed (~10 min)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Tone */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Tone
            </Label>
            <Select
              value={settings.tone}
              onValueChange={(value) => setSettings({ ...settings, tone: value as PodcastTone })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select tone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Audience */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Audience
            </Label>
            <Select
              value={settings.audience}
              onValueChange={(value) => setSettings({ ...settings, audience: value as PodcastAudience })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="executive">Executive</SelectItem>
                <SelectItem value="developer">Developer</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Style */}
          <div className="space-y-3">
            <Label>Content Style</Label>
            <RadioGroup
              value={settings.style}
              onValueChange={(value) => setSettings({ ...settings, style: value as 'overview' | 'technical' })}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="overview" id="style-overview" />
                <Label htmlFor="style-overview" className="cursor-pointer">
                  Overview
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="technical" id="style-technical" />
                <Label htmlFor="style-technical" className="cursor-pointer">
                  Technical
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Estimated Length */}
          <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
            <span className="font-medium">Estimated length:</span> ~{estimatedMinutes} minutes
            <span className="ml-2 text-xs">
              ({DURATION_WORDS[settings.duration].min}-{DURATION_WORDS[settings.duration].max} words)
            </span>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Headphones className="mr-2 h-4 w-4" />
                Generate Podcast
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
