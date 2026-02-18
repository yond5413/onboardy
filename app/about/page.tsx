import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, Github, Sparkles, Code, FileText, Headphones, Play, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import AboutDiagram from './AboutDiagram';

export default function AboutPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-20 py-12">
      {/* Hero Section */}
      <div className="text-center space-y-8">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-sm font-medium">
          <Sparkles className="h-5 w-5" />
          <span>AI-Powered Repository Analysis</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
          Turn Code into
          <span className="text-blue-600 dark:text-blue-400"> Podcasts</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto text-balance">
          Analyze any GitHub repository and generate system design documentation
          with narrated audio explanations. Perfect for onboarding, code reviews,
          and understanding complex codebases.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/login">
            <Button size="lg" className="px-8 py-6 text-lg">
              Sign In to Get Started
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="lg" variant="outline" className="px-8 py-6 text-lg">
              Create Account
            </Button>
          </Link>
        </div>
      </div>

      {/* Value Propositions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle>Comprehensive Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Automatically generate detailed system design documents with architecture overviews,
              component breakdowns, and data flow diagrams for any codebase.
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <Mic className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Audio Narration</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Convert technical documentation into engaging audio podcasts using AI voices.
              Listen while commuting, exercising, or whenever you prefer audio content.
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <CardTitle>Time Savings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Reduce onboarding time from weeks to days. Get up to speed on new projects
              faster with our AI-powered analysis and narration.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* How It Works */}
      <div className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold">How It Works</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Three simple steps to transform any GitHub repository into comprehensive documentation
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
              <Github className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold">Connect Repository</h3>
            <p className="text-muted-foreground">
              Enter any public GitHub repository URL and select your preferred podcast style
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <Play className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold">AI Analysis</h3>
            <p className="text-muted-foreground">
              Our AI analyzes the codebase and generates comprehensive system design documentation
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto">
              <Headphones className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold">Listen & Learn</h3>
            <p className="text-muted-foreground">
              Access your documentation in text, audio, and interactive visualization formats
            </p>
          </div>
        </div>
      </div>

      {/* Features Detail */}
      <div className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold">Powerful Features</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From architecture visualization to podcast-style explanations, our platform offers everything you need
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Interactive Architecture Diagrams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Visualize system architecture with React Flow diagrams that help you understand
                component relationships at a glance.
              </p>
              <AboutDiagram />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Two Podcast Styles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Choose between high-level overviews perfect for executives and onboarding,
                or deep technical dives for senior engineers.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                  <div>
                    <h4 className="font-medium">Overview Style</h4>
                    <p className="text-sm text-muted-foreground">Business-friendly explanations</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
                  <div>
                    <h4 className="font-medium">Technical Style</h4>
                    <p className="text-sm text-muted-foreground">Detailed implementation discussion</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* CTA Section */}
      <div className="text-center space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold">Ready to Transform Your Code Analysis?</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Join thousands of developers who save hours every week with Onboardy
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/login">
            <Button size="lg" className="px-8 py-6 text-lg">
              Get Started for Free
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="lg" variant="outline" className="px-8 py-6 text-lg">
              Create Account
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}