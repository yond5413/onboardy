'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Mic, Github, Sparkles, Code, FileText, Headphones, ArrowRight, Loader2 } from 'lucide-react';
import type { PodcastStyle } from '@/app/lib/script';

export default function HomePage() {
  const router = useRouter();
  const [githubUrl, setGithubUrl] = useState('');
  const [podcastStyle, setPodcastStyle] = useState<PodcastStyle>('overview');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setProgress(10);

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubUrl, podcastStyle }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create job');
      }

      const { jobId } = await response.json();
      
      toast.success('Analysis started! Redirecting...');
      
      // Simulate progress
      setProgress(50);
      setTimeout(() => setProgress(100), 500);
      
      // Redirect to job detail page
      setTimeout(() => {
        router.push(`/jobs/${jobId}`);
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
      setProgress(0);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-sm font-medium">
          <Sparkles className="h-4 w-4" />
          <span>AI-Powered Repository Analysis</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
          Turn Code into
          <span className="text-blue-600 dark:text-blue-400"> Podcasts</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Analyze any GitHub repository and generate system design documentation 
          with narrated audio explanations.
        </p>
      </div>

      {/* Create Job Form */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Start New Analysis
          </CardTitle>
          <CardDescription>
            Enter a GitHub repository URL to begin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="github-url">Repository URL</Label>
              <div className="flex gap-2">
                <Input
                  id="github-url"
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/user/repo"
                  className="flex-1"
                  required
                />
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      Analyze
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>

            {loading && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">
                  Initializing analysis...
                </p>
              </div>
            )}

            <div className="space-y-3">
              <Label>Podcast Style</Label>
              <RadioGroup
                value={podcastStyle}
                onValueChange={(value) => setPodcastStyle(value as PodcastStyle)}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <RadioGroupItem
                    value="overview"
                    id="overview"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="overview"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-blue-600 [&:has([data-state=checked])]:border-blue-600 cursor-pointer"
                  >
                    <FileText className="mb-3 h-6 w-6" />
                    <div className="text-center">
                      <div className="font-semibold">High-Level Overview</div>
                      <div className="text-sm text-muted-foreground">
                        Perfect for onboarding
                      </div>
                    </div>
                  </Label>
                </div>

                <div>
                  <RadioGroupItem
                    value="technical"
                    id="technical"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="technical"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-blue-600 [&:has([data-state=checked])]:border-blue-600 cursor-pointer"
                  >
                    <Code className="mb-3 h-6 w-6" />
                    <div className="text-center">
                      <div className="font-semibold">Technical Deep-Dive</div>
                      <div className="text-sm text-muted-foreground">
                        For senior engineers
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Features Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <FileText className="h-8 w-8 text-blue-600 mb-2" />
            <CardTitle>System Design</CardTitle>
            <CardDescription>
              Comprehensive architecture documentation with diagrams
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Mic className="h-8 w-8 text-green-600 mb-2" />
            <CardTitle>Audio Podcast</CardTitle>
            <CardDescription>
              AI-generated narrated explanations using ElevenLabs
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Headphones className="h-8 w-8 text-purple-600 mb-2" />
            <CardTitle>Interactive Diagrams</CardTitle>
            <CardDescription>
              Explore architecture with React Flow visualizations
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
